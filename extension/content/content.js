/* Leveler — content script.
 * Выравнивает громкость любого <video>/<audio> на странице и управляет скоростью.
 *
 * Цепочка для каждого элемента (одна на элемент, см. chains):
 *
 *   MediaElementSource ─┬─ HighPass → EQ low/mid/high → Compressor → Makeup → Стерео → Limiter → wet ─┬→ destination
 *                       ├─ dry ──────────────────────────────────────────────────────────────────────────┘
 *                       └─ probe (AnalyserNode, только для проверки на тишину)
 *
 *   Стерео:  ─┬─ stereo ─────────┬→ Panner → Splitter ─┬─ balL ─┬→ Merger
 *             └─ monoMix (1 кан.) ┘                     └─ balR ─┘
 *   Моно — плавный переход между stereo и monoMix: узел с одним каналом сводит L+R,
 *   дальше моно снова раскладывается на оба канала.
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
 *
 * AudioFocus (если включён в настройках): фрейм сообщает фоновому скрипту, когда у него
 * появился или пропал звук, и по его команде ставит свои элементы на паузу или приглушает.
 * Приглушение — через отдельный GainNode перед destination, а если элемент не подключён
 * к Web Audio — через el.volume.
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
  const takeover = !!window.__lvAudio;
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
    // сам элемент, а не document: удалённый из DOM элемент тоже ставится на паузу
    for (const t of ['pause', 'ended', 'volumechange', 'emptied', 'loadedmetadata']) el.addEventListener(t, onFocusEvent);
    if (speed !== 1) applySpeed(el, false);
  }

  function scan(root) {
    if (isMedia(root)) track(root);
    if (root.querySelectorAll) root.querySelectorAll('video, audio').forEach(track);
    if (root.shadowRoot) scan(root.shadowRoot);
  }

  // play не всплывает, но ловится на фазе захвата — так видны и элементы,
  // которые MutationObserver ещё не успел найти.
  const onPlayEvent = (e) => { if (isMedia(e.target)) { onPlay(e.target); onFocusEvent(e); } };
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
      stereo: ctx.createGain(),
      monoMix: ctx.createGain(),
      panner: ctx.createStereoPanner(),
      split: ctx.createChannelSplitter(2),
      balL: ctx.createGain(),
      balR: ctx.createGain(),
      merge: ctx.createChannelMerger(2),
      limiter: ctx.createDynamicsCompressor(),
      wet: ctx.createGain(),
      dry: ctx.createGain(),
      focus: ctx.createGain(),               // AudioFocus: приглушение, когда вкладка в фоне
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

    c.monoMix.channelCount = 1;
    c.monoMix.channelCountMode = 'explicit';
    c.monoMix.channelInterpretation = 'speakers';   // стерео → моно: (L + R) / 2

    src.connect(c.probe);
    src.connect(c.dry).connect(c.focus);
    src.connect(c.hp).connect(c.low).connect(c.mid).connect(c.high)
      .connect(c.comp).connect(c.makeup);
    c.makeup.connect(c.stereo).connect(c.panner);
    c.makeup.connect(c.monoMix).connect(c.panner);
    c.panner.connect(c.split);
    c.split.connect(c.balL, 0).connect(c.merge, 0, 0);
    c.split.connect(c.balR, 1).connect(c.merge, 0, 1);
    c.merge.connect(c.limiter).connect(c.wet).connect(ctx.destination);

    applyParams(c, true);
    chains.set(el, c);
    if (!el.paused) startProbe(c);
    updateBadge();
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
    // панорама может сложить оба канала в один — лимитер стоит после неё
    setParam(c.stereo.gain, p.mono ? 0 : 1, now);
    setParam(c.monoMix.gain, p.mono ? 1 : 0, now);
    setParam(c.panner.pan, p.pan / 100, now);
    setParam(c.balL.gain, Math.min(1, 1 - p.balance / 100), now);
    setParam(c.balR.gain, Math.min(1, 1 + p.balance / 100), now);
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
    updateBadge();
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
      updateBadge();
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
    const ls = lives.get(el);
    if (ls) { ls.rate = 0; ls.samples = []; }   // скорость задали вручную: догон начинает заново
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

  // ───────────────────────── догон прямого эфира ─────────────────────────
  //
  // Насколько отстали, видно по запасу буфера: сколько секунд уже загружено впереди
  // текущей позиции. У трансляции он пилой растёт с каждым сегментом и тает между ними,
  // поэтому смотрим на минимум за последние секунды: это запас в самый худший момент.
  // Пока минимум выше безопасного, есть что «проглотить» быстрее, не дожидаясь сети.
  // Если всё же случилась подгрузка, безопасный запас для этого элемента растёт.
  const LIVE = {
    every: 500,          // мс между проверками, пока играет видео
    window: 10000,       // мс истории запаса буфера
    safe: 2,             // с, ниже этого запаса не опускаемся
    safeMax: 8,
    start: 1.5,          // с лишнего запаса, с которых начинаем догонять
    stop: 0.3,           // с лишнего запаса, на которых возвращаем 1×
    gain: 0.06,          // прибавка скорости на секунду лишнего запаса
    minRate: 1.1,        // медленнее догонять нет смысла: хвост растянется на минуты
    maxRate: 1.2,
    step: 0.05,          // шаг изменения скорости за одну проверку
    dvr: 30,             // с: дальше этого от края — смотрят запись эфира, не трогаем
    yield: 30000         // мс паузы, если скорость поменял сам сайт
  };
  const lives = new WeakMap();             // элемент → состояние догона
  let liveTimer = 0;

  function liveState(el) {
    let s = lives.get(el);
    if (!s) lives.set(el, s = { samples: [], rate: 0, safe: LIVE.safe, grow: 0, dur: 0, until: 0 });
    return s;
  }

  // Трансляцию выдаёт длительность: бесконечная, условно огромная (2^30 у плееров Twitch
  // и Kick) или растущая во время просмотра (YouTube).
  function isLive(el) {
    const d = el.duration;
    if (d === Infinity || d >= 1e9) return true;
    return liveState(el).grow >= 3;
  }

  function onDuration(el) {
    const s = liveState(el), d = el.duration;
    if (isFinite(d) && s.dur > 0 && d > s.dur && d - s.dur < 60 && !el.paused) s.grow++;
    else if (!isFinite(d) || d < s.dur) s.grow = 0;
    s.dur = isFinite(d) ? d : 0;
    if (isLive(el)) startLive();
  }

  function onStall(el) {
    const s = lives.get(el);
    if (!s || !s.rate) return;
    // догоняли и всё же упёрлись в край: дальше держим запас побольше
    s.safe = Math.min(LIVE.safeMax, s.safe + 1);
    releaseLive(el, s);
  }

  function startLive() {
    if (liveTimer || !settings.liveCatchup) return;
    liveTimer = setInterval(liveTick, LIVE.every);
  }

  function stopLive() {
    clearInterval(liveTimer);
    liveTimer = 0;
    for (const el of media) { const s = lives.get(el); if (s) releaseLive(el, s); }
  }

  // вернуть скорость пользователя, если на элементе всё ещё наша
  function releaseLive(el, s) {
    if (s.rate && Math.abs(el.playbackRate - s.rate) < 0.001) {
      try { el.playbackRate = speed; } catch (e) { /* плеер не даёт менять скорость */ }
    }
    s.rate = 0;
    s.samples = [];
  }

  // Запас буфера впереди текущей позиции и конец этого участка.
  function bufferAhead(el) {
    const b = el.buffered, t = el.currentTime;
    for (let i = b.length - 1; i >= 0; i--) {
      if (b.start(i) <= t + 0.2 && b.end(i) >= t) return { ahead: b.end(i) - t, end: b.end(i) };
    }
    return null;
  }

  function liveTick() {
    if (!settings.liveCatchup) { stopLive(); return; }
    const now = performance.now();
    let playing = false;
    for (const el of media) {
      if (el.paused || el.ended) { const s = lives.get(el); if (s && s.rate) releaseLive(el, s); continue; }
      playing = true;
      if (!isLive(el)) continue;
      const s = liveState(el);
      // пользователь выбрал свою скорость — догон ему не нужен
      if (speed !== 1 || now < s.until) { if (s.rate) releaseLive(el, s); continue; }
      // скорость сменил кто-то другой: сайт сам управляет задержкой, не спорим
      if (Math.abs(el.playbackRate - (s.rate || speed)) > 0.001) {
        s.rate = 0; s.samples = []; s.until = now + LIVE.yield;
        continue;
      }
      const buf = bufferAhead(el);
      const sk = el.seekable;
      const edge = sk.length ? sk.end(sk.length - 1) : NaN;
      if (!buf || (isFinite(edge) && edge - buf.end > LIVE.dvr)) { if (s.rate) releaseLive(el, s); continue; }

      s.samples.push({ t: now, a: buf.ahead });
      while (s.samples.length && now - s.samples[0].t > LIVE.window) s.samples.shift();
      // мало истории — ещё не знаем, как глубоко проседает запас между сегментами
      if (now - s.samples[0].t < LIVE.window * 0.8) continue;
      let min = Infinity;
      for (const x of s.samples) if (x.a < min) min = x.a;
      const spare = min - s.safe;

      let want = 1;
      if (spare > (s.rate ? LIVE.stop : LIVE.start)) {
        want = Math.max(LIVE.minRate, Math.min(LIVE.maxRate, 1 + spare * LIVE.gain));
        want = Math.round(want / LIVE.step) * LIVE.step;
      }
      const cur = s.rate || 1;
      let next = cur + Math.max(-LIVE.step, Math.min(LIVE.step, want - cur));
      next = Math.round(next * 100) / 100;
      if (next <= 1.001) { if (s.rate) releaseLive(el, s); continue; }
      if (Math.abs(next - cur) < 0.001 && s.rate) continue;
      try {
        el.preservesPitch = true;
        el.playbackRate = next;
        s.rate = next;
      } catch (e) {
        s.until = now + LIVE.yield;
      }
    }
    if (!playing) { clearInterval(liveTimer); liveTimer = 0; }
  }

  function liveStatus() {
    let out = null;
    for (const el of media) {
      if (el.paused || !isLive(el)) continue;
      const s = liveState(el), buf = bufferAhead(el);
      const cur = { rate: s.rate || 0, ahead: buf ? Math.round(buf.ahead * 10) / 10 : null };
      if (!out || cur.rate > out.rate) out = cur;
    }
    return out;
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

  // ───────────────────────── AudioFocus ─────────────────────────

  const SHORT_SOUND = 5;                   // с: звуки уведомлений короче — фокус не забирают
  const DUCK_TAU = 0.12;                   // плавность приглушения, с
  let held = null;                         // null | 'pause' | 'duck' — команда фонового скрипта
  let sentAudible = false;                 // что последним сообщили фоновому скрипту
  const pausedByFocus = new Set();         // элементы, которые на паузу поставили мы
  const volDucked = new Map();             // элемент → { orig, set }: приглушён через el.volume
  const wasAudible = new WeakMap();

  function audible(el) {
    if (el.paused || el.ended || el.muted) return false;
    const d = volDucked.get(el);
    if ((d ? d.orig : el.volume) === 0) return false;
    return !(isFinite(el.duration) && el.duration < SHORT_SOUND);
  }

  function onFocusEvent(e) {
    const el = e.target;
    if (e.type === 'volumechange') {
      // громкость поменял сайт или пользователь — наше приглушение больше не трогаем
      const d = volDucked.get(el);
      if (d && Math.abs(el.volume - d.set) > 0.002) volDucked.delete(el);
    }
    if (settings.focusMode === 'off') return;
    const now = audible(el);
    const before = wasAudible.get(el) || false;
    wasAudible.set(el, now);
    if (now && held === 'duck') duck(el);
    // звук включили во вкладке, которую видно: она забирает фокус
    reportFocus(now && !before && document.visibilityState === 'visible');
  }

  function reportFocus(claim) {
    let playing = false;
    for (const el of media) if (audible(el)) { playing = true; break; }
    if (playing === sentAudible && !(claim && playing)) return;
    sentAudible = playing;
    try { chrome.runtime.sendMessage({ type: 'lv:audible', playing, claim: claim && playing }).catch(() => {}); }
    catch (e) { /* расширение обновили */ }
  }

  function duck(el) {
    const c = chains.get(el);
    if (c && c.focus) {
      c.focus.gain.setTargetAtTime(settings.focusDuck, ctx.currentTime, DUCK_TAU);
    } else if (!volDucked.has(el) && el.volume > 0) {
      const orig = el.volume;
      el.volume = orig * settings.focusDuck;
      volDucked.set(el, { orig, set: el.volume });
    }
  }

  function unduckAll() {
    for (const el of media) {
      const c = chains.get(el);
      if (c && c.focus) c.focus.gain.setTargetAtTime(1, ctx.currentTime, DUCK_TAU);
    }
    for (const [el, d] of volDucked) if (Math.abs(el.volume - d.set) <= 0.002) el.volume = d.orig;
    volDucked.clear();
  }

  function onFocusCommand(action) {
    if (action === 'restore' || action !== held) {
      unduckAll();
      for (const el of pausedByFocus) if (el.paused && el.isConnected) el.play().catch(() => {});
      pausedByFocus.clear();
      held = null;
    }
    if (action === 'pause') {
      held = 'pause';
      for (const el of media) if (audible(el)) { pausedByFocus.add(el); el.pause(); }
    } else if (action === 'duck') {
      held = 'duck';
      for (const el of media) duck(el);
    }
  }

  // режим включили — сообщаем, звучит ли фрейм прямо сейчас; выключили — всё отпускаем
  function onFocusMode() {
    if (settings.focusMode === 'off') {
      sentAudible = false;
      onFocusCommand('restore');
    } else {
      for (const el of media) wasAudible.set(el, audible(el));
      reportFocus(false);
    }
  }

  const onPageHide = () => { if (sentAudible) { sentAudible = false; reportFocus(false); } };
  window.addEventListener('pagehide', onPageHide);

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
      found, playing, processed, reason, reload, speed, drmHost: hostUnsupported,
      audio: ctx ? ctx.state : 'none'
    };
  }

  // ───────── значок: усиление громкости на иконке расширения ─────────
  // Показываем, только когда звук этого фрейма реально обрабатывается. Рисует значок
  // background.js; сообщение уходит, только если текст изменился.
  let badge = takeover ? null : '';        // после обновления расширения значок мог остаться от старого скрипта
  function updateBadge() {
    let on = false;
    for (const el of media) { const c = chains.get(el); if (c && !c.silent) { on = true; break; } }
    const v = Math.round(params.volume);
    const text = on && settings.enabled && v !== 100 ? v + '%' : '';
    if (text === badge) return;
    badge = text;
    try { chrome.runtime.sendMessage({ type: 'lv:badge', text, boost: v > 100 }).catch(() => {}); } catch (e) { /* расширение обновили */ }
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
    } else if (msg.type === 'lv:focus') {
      onFocusCommand(msg.action);
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

  chrome.storage.sync.get(['enabled', 'focusMode', 'focusDuck', 'def', 'keys', SITE_KEY], (all) => {
    all = all || {};
    settings = LV.normalize(all);
    if (settings.focusMode !== 'off') onFocusMode();
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
    if (changes.enabled || changes.focusMode || changes.focusDuck) {
      const prev = settings;
      const next = {};
      for (const k of ['enabled', 'focusMode', 'focusDuck']) next[k] = changes[k] ? changes[k].newValue : prev[k];
      settings = LV.normalize(next);
      if (settings.enabled !== prev.enabled) applyAll();
      if (settings.focusMode !== prev.focusMode) onFocusMode();
      else if (held === 'duck' && settings.focusDuck !== prev.focusDuck) for (const el of media) duck(el);
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
    window.removeEventListener('pagehide', onPageHide);
    mo.disconnect();
    // после обновления фоновый скрипт начинает с чистого листа: приглушение не должно остаться
    unduckAll();
    for (const el of media) for (const t of ['pause', 'ended', 'volumechange', 'emptied', 'loadedmetadata']) el.removeEventListener(t, onFocusEvent);
    for (const el of media) stopProbe(chains.get(el));
    stopLive();
    if (overlay) overlay.host.remove();
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.storage.onChanged.removeListener(onStorage);
    } catch (e) { /* контекст старого расширения уже недоступен */ }
  }
  window.addEventListener('leveler-takeover', teardown);

  // для автотестов (store/tests): доступно только в изолированном мире расширения
  self.__leveler = { status, chains, media, get ctx() { return ctx; }, get params() { return params; }, get held() { return held; } };
})();
