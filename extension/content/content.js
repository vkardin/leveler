/* Leveler — content script.
 * Выравнивает громкость любого <video>/<audio> на странице и управляет скоростью.
 *
 * Цепочка для каждого элемента (одна на элемент, см. chains):
 *
 *   MediaElementSource ─┬─ HighPass → EQ low/mid/high → Compressor → Makeup → Limiter → wet ─┬→ destination
 *                       ├─ dry ───────────────────────────────────────────────────────────────┘
 *                       └─ probe (AnalyserNode, только для проверки на тишину)
 *
 * Вкл/выкл (bypass) — плавный переход между wet и dry, без перезагрузки и без щелчков.
 *
 * AudioContext создаётся и подключается к элементу только когда он реально запущен
 * (state === 'running'). Пока браузер держит его в suspended (нет действия пользователя),
 * элемент не трогаем и звук играет как есть: подключить источник к спящему контексту
 * значит оставить видео без звука.
 *
 * DRM и чужие источники без CORS: браузер отдаёт в Web Audio только нули. Такие элементы
 * распознаём заранее (mediaKeys, событие encrypted, src с другого origin без crossorigin)
 * и не подключаем. Если тишина всё же пришла после подключения, это видно по probe:
 * звук декодируется, а на выходе ровно 0 несколько секунд. Тогда сайт запоминается
 * в chrome.storage.local, и после перезагрузки страницы звук идёт без обработки.
 */
(() => {
  'use strict';

  const LV = self.LV;
  const PR = self.LV_PRESETS;
  if (!LV || !PR) return;
  // После установки или обновления расширения скрипт заново внедряется в открытые вкладки
  // (background.js, popup). Старый экземпляр в той же вкладке уступает место новому:
  // снимает свои обработчики, а AudioContext и цепочки оставляет в window.__lvAudio —
  // элемент, уже подключённый к Web Audio, второй раз подключить нельзя.
  window.dispatchEvent(new Event('leveler-takeover'));
  const shared = window.__lvAudio || (window.__lvAudio = { ctx: null, chains: new WeakMap() });

  const HOST = LV.normHost(location.hostname);
  const SITE = PR.topHost();               // настройки берутся по сайту вкладки, и для iframe тоже
  const SITE_KEY = PR.siteKey(SITE);
  const TAU = 0.04;                        // постоянная времени setTargetAtTime, с
  const SILENT_MS = 5000;                  // столько воспроизведения ровной тишины → не поддерживается
  const PROBE_EVERY = 250;
  const CACHE_KEY = 'unsupportedHosts';    // chrome.storage.local: { host: время }
  // Сайты, где звук всегда защищён DRM: не пытаемся даже подключаться.
  const DRM_HOSTS = ['netflix.com', 'disneyplus.com', 'primevideo.com', 'amazon.com',
    'max.com', 'hbomax.com', 'hulu.com', 'tv.apple.com', 'paramountplus.com',
    'peacocktv.com', 'kinopoisk.ru', 'ivi.ru', 'okko.tv', 'megogo.net'];

  let settings = LV.normalize();
  let stored = {};                         // def и профиль сайта из storage.sync
  let profile = PR.normalizeProfile(PR.DEFAULT_PROFILE);
  let params = profile.params;             // текущие параметры звука (popup может менять их вживую)
  let speed = 1;                           // скорость на этой странице
  let ctx = shared.ctx;
  let hostUnsupported = DRM_HOSTS.some((h) => HOST === h || HOST.endsWith('.' + h));
  let cachedUnsupported = false;

  const chains = shared.chains;            // элемент → цепочка; один элемент — одна цепочка
  const blocked = new WeakMap();           // элемент → причина, по которой его не трогаем
  const media = new Set();                 // все найденные <video>/<audio> этого фрейма
  const waiting = new Set();               // ждут, пока AudioContext проснётся

  const isMedia = (el) => el instanceof HTMLMediaElement;
  const dbToGain = (db) => Math.pow(10, db / 20);

  // ───────────────────────── поиск элементов ─────────────────────────

  function track(el) {
    if (media.has(el)) return;
    media.add(el);
    el.addEventListener('encrypted', () => markBlocked(el, 'drm'));
    el.addEventListener('loadstart', () => onSourceChange(el));
    el.addEventListener('pause', () => stopProbe(chains.get(el)));
    if (speed !== 1) applySpeed(el, false);
  }

  function scan(root) {
    if (isMedia(root)) track(root);
    if (root.querySelectorAll) root.querySelectorAll('video, audio').forEach(track);
    if (root.shadowRoot) scan(root.shadowRoot);
  }

  // play не всплывает, но ловится на фазе захвата — так видны и элементы,
  // которые MutationObserver ещё не успел найти.
  const onPlayEvent = (e) => { if (isMedia(e.target)) onPlay(e.target); };
  const onPlayingEvent = (e) => { if (isMedia(e.target)) startProbe(chains.get(e.target)); };
  document.addEventListener('play', onPlayEvent, true);
  document.addEventListener('playing', onPlayingEvent, true);

  const mo = new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n);
  });
  mo.observe(document.documentElement || document, { childList: true, subtree: true });
  scan(document);
  // уже играющие (например, после обновления расширения) — подключаем сразу
  for (const el of media) if (!el.paused) queueMicrotask(() => onPlay(el));

  // Первое действие пользователя на странице разрешает запустить AudioContext.
  // ───────── горячие клавиши: скорость ─────────
  let keys = PR.normalizeKeys();
  let speedSaveTimer = 0;

  function saveSiteSpeed() {
    profile = Object.assign({}, profile, { speed });
    clearTimeout(speedSaveTimer);
    speedSaveTimer = setTimeout(() => {
      const value = Object.assign({}, PR.normalizeProfile(stored[SITE_KEY] || stored.def || PR.DEFAULT_PROFILE), { speed });
      stored[SITE_KEY] = value;
      try { chrome.storage.sync.set({ [SITE_KEY]: value }); } catch (e) { /* расширение обновили */ }
    }, 600);
  }

  const onKey = (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing || !media.size) return;
    const t = e.composedPath ? e.composedPath()[0] : e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    let next = null;
    if (e.key === keys.slower) next = speed - keys.step;
    else if (e.key === keys.faster) next = speed + keys.step;
    else if (e.key === keys.reset) next = 1;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    setSpeed(next);
    saveSiteSpeed();
  };
  window.addEventListener('keydown', onKey, true);

  const wake = () => {
    if (!ctx || ctx.state === 'running') return;
    ctx.resume().then(flushWaiting, () => {});
  };
  window.addEventListener('pointerdown', wake, true);
  window.addEventListener('keydown', wake, true);

  // ───────────────────────── подключение ─────────────────────────

  function onPlay(el) {
    track(el);
    if (speed !== 1) applySpeed(el, false);
    connect(el);
    const c = chains.get(el);
    if (c) startProbe(c);
  }

  function blockReason(el) {
    if (hostUnsupported) return 'drm';
    if (cachedUnsupported) return 'cached';
    if (el.mediaKeys) return 'drm';
    if (isCrossOrigin(el)) return 'cors';
    return null;
  }

  function isCrossOrigin(el) {
    if (el.srcObject) return false;
    const src = el.currentSrc || el.src;
    if (!src) return false;
    let u;
    try { u = new URL(src, location.href); } catch (e) { return false; }
    if (u.protocol === 'blob:' || u.protocol === 'data:') return false;   // MSE (YouTube, Twitch) — свой origin
    if (u.origin === location.origin) return false;
    return !el.crossOrigin;   // с атрибутом crossorigin браузер сам проверит CORS, данные будут чистыми
  }

  function connect(el) {
    if (chains.has(el) || blocked.has(el)) return;
    const why = blockReason(el);
    if (why) { markBlocked(el, why); return; }
    if (!settings.enabled) return;         // выключено и ещё не подключали — вообще не трогаем элемент
    if (PR.isNeutral(params)) return;      // пресет «Выкл»: обрабатывать нечего, звук остаётся как есть
    if (!ensureCtx()) return;
    if (ctx.state === 'running') build(el);
    else {
      waiting.add(el);
      ctx.resume().then(flushWaiting, () => {});
    }
  }

  function flushWaiting() {
    if (!ctx || ctx.state !== 'running') return;
    for (const el of waiting) if (!el.paused || el.readyState > 0) build(el);
    waiting.clear();
  }

  function ensureCtx() {
    if (ctx) return true;
    try {
      ctx = shared.ctx = new AudioContext({ latencyHint: 'interactive' });
      ctx.addEventListener('statechange', () => flushWaiting());
      return true;
    } catch (e) {
      ctx = null;
      return false;
    }
  }

  function build(el) {
    if (chains.has(el) || blocked.has(el)) return;
    const why = blockReason(el);   // за время ожидания мог появиться DRM или смениться src
    if (why) { markBlocked(el, why); return; }
    let src;
    try {
      src = ctx.createMediaElementSource(el);
    } catch (e) {
      // элемент уже подключён к другому контексту (например, самим сайтом)
      markBlocked(el, 'busy');
      return;
    }
    const biquad = (type, freq, q) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      if (q) f.Q.value = q;
      f.gain.value = 0;
      return f;
    };
    const c = {
      el, src,
      hp: biquad('highpass', 10, 0.707),     // 10 Гц — фактически выключен (hp = 0)
      low: biquad('lowshelf', 120),
      mid: biquad('peaking', 1500, 0.8),
      high: biquad('highshelf', 8000),
      comp: ctx.createDynamicsCompressor(),
      makeup: ctx.createGain(),
      limiter: ctx.createDynamicsCompressor(),
      wet: ctx.createGain(),
      dry: ctx.createGain(),
      probe: ctx.createAnalyser(),
      buf: null, timer: 0, lastTick: 0, silentMs: 0, heard: false, silent: false, decoded: -1
    };
    c.probe.fftSize = 2048;
    c.buf = new Float32Array(c.probe.fftSize);
    // защитный лимитер: makeup и быстрые всплески не должны клиповать
    c.limiter.threshold.value = -1;
    c.limiter.knee.value = 0;
    c.limiter.ratio.value = 20;
    c.limiter.attack.value = 0.001;
    c.limiter.release.value = 0.1;

    src.connect(c.probe);
    src.connect(c.dry).connect(ctx.destination);
    src.connect(c.hp).connect(c.low).connect(c.mid).connect(c.high)
      .connect(c.comp).connect(c.makeup).connect(c.limiter).connect(c.wet).connect(ctx.destination);

    applyParams(c, true);
    chains.set(el, c);
    if (!el.paused) startProbe(c);
  }

  function setParam(p, v, now) {
    if (now) { p.cancelScheduledValues(0); p.value = v; }
    else p.setTargetAtTime(v, ctx.currentTime, TAU);
  }

  function applyParams(c, now) {
    const p = params;
    setParam(c.comp.threshold, p.threshold, now);
    setParam(c.comp.knee, p.knee, now);
    setParam(c.comp.ratio, p.ratio, now);
    setParam(c.comp.attack, p.attack, now);
    setParam(c.comp.release, p.release, now);
    // усиление громкости — до лимитера, он не даст перегрузить звук
    setParam(c.makeup.gain, dbToGain(p.makeup) * p.volume / 100, now);
    setParam(c.hp.frequency, Math.max(10, p.hp), now);
    setParam(c.low.gain, p.low, now);
    setParam(c.mid.gain, p.mid, now);
    setParam(c.high.gain, p.high, now);
    const on = settings.enabled && !c.silent && !PR.isNeutral(p);
    setParam(c.wet.gain, on ? 1 : 0, now);
    setParam(c.dry.gain, on ? 0 : 1, now);
  }

  function applyAll() {
    for (const el of media) {
      const c = chains.get(el);
      if (c) applyParams(c, false);
      else if (settings.enabled && !el.paused) connect(el);
    }
  }

  // ───────────────────────── DRM / CORS ─────────────────────────

  function markBlocked(el, why) {
    if (blocked.get(el) === why) return;
    blocked.set(el, why);
    waiting.delete(el);
    // DRM включился уже после подключения: этот элемент останется без звука до перезагрузки,
    // поэтому сайт запоминаем, чтобы в следующий раз его не трогать
    if (why === 'drm' && chains.has(el)) rememberUnsupported();
  }

  function onSourceChange(el) {
    const c = chains.get(el);
    if (!c) {
      // новый src мог оказаться обычным: проверим заново при следующем play
      if (blocked.get(el) === 'cors') blocked.delete(el);
      return;
    }
    c.silentMs = 0;
    c.heard = false;
    c.decoded = -1;
  }

  // Проверка на тишину работает только первые секунды воспроизведения, пока звук
  // не появился. Как только услышали сигнал — таймер останавливается.
  function startProbe(c) {
    if (!c || c.timer || c.heard) return;
    c.lastTick = performance.now();
    c.timer = setInterval(() => probe(c), PROBE_EVERY);
  }

  function stopProbe(c) {
    if (!c || !c.timer) return;
    clearInterval(c.timer);
    c.timer = 0;
  }

  function probe(c) {
    const el = c.el;
    const t = performance.now();
    const dt = t - c.lastTick;
    c.lastTick = t;
    if (el.paused || el.muted || el.volume === 0 || el.readyState < 3) return;
    // Chrome считает декодированные байты звука: нет роста — у видео просто нет звуковой дорожки
    const dec = typeof el.webkitAudioDecodedByteCount === 'number' ? el.webkitAudioDecodedByteCount : null;
    const hasAudio = dec === null ? el.mozHasAudio !== false : dec > 0;
    if (!hasAudio) return;
    c.probe.getFloatTimeDomainData(c.buf);
    let peak = 0;
    for (let i = 0; i < c.buf.length; i++) { const v = Math.abs(c.buf[i]); if (v > peak) peak = v; }
    if (peak > 0) {
      c.heard = true;
      if (c.silent) {
        c.silent = false;
        if (blocked.get(el) === 'silent') blocked.delete(el);
        applyParams(c, false);
      }
      stopProbe(c);
      return;
    }
    c.silentMs += dt;
    if (c.silentMs >= SILENT_MS && !c.silent) {
      c.silent = true;
      markBlocked(el, 'silent');
      applyParams(c, false);
      rememberUnsupported();
    }
  }

  function rememberUnsupported() {
    if (cachedUnsupported) return;
    chrome.storage.local.get(CACHE_KEY, (r) => {
      const map = Object.assign({}, r && r[CACHE_KEY]);
      map[HOST] = Date.now();
      chrome.storage.local.set({ [CACHE_KEY]: map });
    });
  }

  // ───────────────────────── скорость ─────────────────────────

  function applySpeed(el, show) {
    try {
      el.preservesPitch = true;
      if (Math.abs(el.playbackRate - speed) > 0.001) el.playbackRate = speed;
    } catch (e) { /* некоторые плееры запрещают менять скорость */ }
    if (show) showOverlay(el);
  }

  function setSpeed(v) {
    speed = LV.clampSpeed(v);
    let shown = false;
    for (const el of media) {
      if (!el.isConnected && el.paused) { media.delete(el); continue; }
      // оверлей — один раз, у видео, которое сейчас смотрят
      const show = !shown && el instanceof HTMLVideoElement && isVisible(el);
      applySpeed(el, show);
      shown = shown || show;
    }
  }

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 40 && r.height > 40 && r.bottom > 0 && r.top < innerHeight;
  }

  let overlay = null, overlayTimer = 0;

  function showOverlay(el) {
    if (!overlay) {
      const host = document.createElement('div');
      host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;pointer-events:none;';
      const root = host.attachShadow({ mode: 'closed' });
      root.innerHTML = '<style>b{display:block;font:600 22px/1 system-ui,sans-serif;color:#fff;' +
        'background:rgba(0,0,0,.62);padding:10px 14px;border-radius:10px;transition:opacity .25s;' +
        'font-variant-numeric:tabular-nums}</style><b></b>';
      overlay = { host, label: root.querySelector('b') };
    }
    // в полноэкранном режиме видно только содержимое fullscreen-элемента
    const fs = document.fullscreenElement;
    const parent = fs && fs !== el && !isMedia(fs) ? fs : document.documentElement;
    if (overlay.host.parentNode !== parent) parent.appendChild(overlay.host);
    const r = el.getBoundingClientRect();
    overlay.host.style.left = Math.max(8, r.left + 16) + 'px';
    overlay.host.style.top = Math.max(8, r.top + 16) + 'px';
    overlay.label.textContent = (Math.round(speed * 100) / 100) + '×';
    overlay.label.style.opacity = '1';
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => { overlay.label.style.opacity = '0'; }, 900);
  }

  // ───────────────────────── статус для popup ─────────────────────────

  function status() {
    let found = 0, playing = 0, processed = 0, reason = null, reload = false;
    for (const el of media) {
      if (!el.isConnected && el.paused) continue;
      found++;
      if (!el.paused) playing++;
      const c = chains.get(el);
      if (c && !c.silent) processed++;
      const b = blocked.get(el);
      if (b && b !== 'busy' && (!el.paused || !reason)) reason = b;
      if (b && c) reload = true;   // элемент уже подключён и молчит: звук вернёт только перезагрузка
    }
    if (!reason && (hostUnsupported || cachedUnsupported) && found) reason = hostUnsupported ? 'drm' : 'cached';
    return {
      type: 'lv:status', host: HOST, site: SITE, top: window === window.top,
      found, playing, processed, reason, reload, speed,
      audio: ctx ? ctx.state : 'none'
    };
  }

  // Уровни для индикатора в popup: popup спрашивает, пока открыт, на странице ничего не крутится.
  const meterBuf = new Float32Array(2048);
  function rmsDb(an) {
    an.getFloatTimeDomainData(meterBuf);
    let sum = 0;
    for (let i = 0; i < meterBuf.length; i++) sum += meterBuf[i] * meterBuf[i];
    return Math.max(-90, 10 * Math.log10(sum / meterBuf.length + 1e-12));
  }
  function levels() {
    for (const el of media) {
      const c = chains.get(el);
      if (!c || el.paused || c.silent) continue;
      if (!c.meter) {
        c.meter = ctx.createAnalyser();
        c.meter.fftSize = 2048;
        c.limiter.connect(c.meter);
      }
      return { pre: rmsDb(c.probe), post: settings.enabled ? rmsDb(c.meter) : rmsDb(c.probe) };
    }
    return null;
  }

  const onMessage = (msg, sender, reply) => {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'lv:levels') {
      const l = levels();
      if (l) reply(l);           // фреймы без играющего видео молчат, ответит тот, где звук
    } else if (msg.type === 'lv:hello') {
      const s = status();
      // каждый фрейм отвечает отдельным сообщением: reply от вкладки доходит только один
      if (s.found || s.top) chrome.runtime.sendMessage(s).catch(() => {});
    } else if (msg.type === 'lv:speed') {
      setSpeed(msg.speed);
      chrome.runtime.sendMessage(status()).catch(() => {});
    } else if (msg.type === 'lv:params') {
      // пока двигают ползунок: применяем сразу, в storage popup пишет реже
      params = PR.normalizeParams(msg.params);
      applyAll();
    }
  };
  chrome.runtime.onMessage.addListener(onMessage);

  // ───────────────────────── настройки ─────────────────────────

  // Профиль: свой у сайта, иначе общий по умолчанию. Скорость профиля применяется
  // при загрузке и когда её меняют (в том числе из другой вкладки того же сайта).
  function resolveProfile(first) {
    const prev = profile;
    profile = PR.normalizeProfile(stored[SITE_KEY] || stored.def || PR.DEFAULT_PROFILE);
    params = profile.params;
    applyAll();
    if (first ? profile.speed !== 1 : profile.speed !== prev.speed && profile.speed !== speed) setSpeed(profile.speed);
  }

  chrome.storage.sync.get(['enabled', 'def', 'keys', SITE_KEY], (all) => {
    all = all || {};
    settings = LV.normalize(all);
    keys = PR.normalizeKeys(all.keys);
    stored = { def: all.def, [SITE_KEY]: all[SITE_KEY] };
    resolveProfile(true);
  });
  chrome.storage.local.get(CACHE_KEY, (r) => {
    cachedUnsupported = !!(r && r[CACHE_KEY] && r[CACHE_KEY][HOST]);
  });

  const onStorage = (changes, area) => {
    if (area === 'local' && changes[CACHE_KEY]) {
      const map = changes[CACHE_KEY].newValue || {};
      cachedUnsupported = !!map[HOST];
      return;
    }
    if (area !== 'sync') return;
    if (changes.keys) keys = PR.normalizeKeys(changes.keys.newValue);
    if (changes.enabled) {
      settings = LV.normalize({ enabled: changes.enabled.newValue });
      applyAll();
    }
    if (changes.def || changes[SITE_KEY]) {
      if (changes.def) stored.def = changes.def.newValue;
      if (changes[SITE_KEY]) stored[SITE_KEY] = changes[SITE_KEY].newValue;
      resolveProfile(false);
    }
  };
  chrome.storage.onChanged.addListener(onStorage);

  // новый экземпляр скрипта (после обновления расширения) забирает работу себе
  function teardown() {
    window.removeEventListener('leveler-takeover', teardown);
    document.removeEventListener('play', onPlayEvent, true);
    document.removeEventListener('playing', onPlayingEvent, true);
    window.removeEventListener('pointerdown', wake, true);
    window.removeEventListener('keydown', wake, true);
    window.removeEventListener('keydown', onKey, true);
    mo.disconnect();
    for (const el of media) stopProbe(chains.get(el));
    if (overlay) overlay.host.remove();
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.storage.onChanged.removeListener(onStorage);
    } catch (e) { /* контекст старого расширения уже недоступен */ }
  }
  window.addEventListener('leveler-takeover', teardown);

  // для автотестов (store/tests): доступно только в изолированном мире расширения
  self.__leveler = { status, chains, media, get ctx() { return ctx; }, get params() { return params; } };
})();
