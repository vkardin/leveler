(() => {
  const LV = self.LV;
  const t = self.lvT;
  const $ = (s) => document.querySelector(s);
  const CACHE_KEY = 'unsupportedHosts';
  const STALE_MS = 2500;                   // ответ фрейма старше этого — фрейма больше нет

  let settings = LV.normalize();
  let tabId = null;
  let speed = 1;
  let speedTouched = 0;                    // пока ползунок двигают, не перезаписываем его ответами
  const frames = new Map();                // frameId → { s: статус, at: время }

  self.lvApplyI18n();
  $('#version').textContent = 'v' + chrome.runtime.getManifest().version;

  const els = {
    enabled: $('#enabled'), level: $('#level'), levelOut: $('#levelOut'), levelInfo: $('#levelInfo'),
    speed: $('#speed'), speedOut: $('#speedOut'), chips: $('#chips'),
    status: $('#status'), statusText: $('#statusText'),
    notice: $('#notice'), noticeText: $('#noticeText'), retry: $('#retry')
  };

  els.speed.min = LV.SPEED_MIN;
  els.speed.max = LV.SPEED_MAX;
  els.speed.step = LV.SPEED_STEP;

  const fill = (input) => {
    const p = (input.value - input.min) / (input.max - input.min) * 100;
    input.style.setProperty('--p', p + '%');
  };
  const fmtSpeed = (v) => (Math.round(v * 100) / 100) + '×';
  const fmtDb = (v) => (v < 0 ? '−' : '') + Math.abs(Math.round(v)) + ' dB';

  // ───────────────────────── отрисовка ─────────────────────────

  function renderSettings() {
    els.enabled.checked = settings.enabled;
    document.body.classList.toggle('off', !settings.enabled);
    els.level.value = settings.level;
    els.levelOut.textContent = settings.level + '%';
    const p = LV.levelToParams(settings.level);
    els.levelInfo.textContent = settings.level === 0 ? t('p_level_none')
      : t('p_level_info', fmtDb(p.threshold), (Math.round(p.ratio * 10) / 10) + ':1');
    fill(els.level);
  }

  function renderSpeed() {
    els.speed.value = speed;
    els.speedOut.textContent = fmtSpeed(speed);
    fill(els.speed);
    for (const b of els.chips.children) b.classList.toggle('on', Math.abs(+b.dataset.speed - speed) < 0.001);
  }

  function renderStatus() {
    const now = Date.now();
    let found = 0, playing = 0, processed = 0, reason = null, reload = false, suspended = false, any = false;
    for (const [id, f] of frames) {
      if (now - f.at > STALE_MS) { frames.delete(id); continue; }
      any = true;
      const s = f.s;
      found += s.found; playing += s.playing; processed += s.processed;
      if (s.reason && (!reason || s.playing)) reason = s.reason;
      reload = reload || s.reload;
      if (s.audio === 'suspended' && s.found) suspended = true;
    }

    let cls = '', text;
    if (tabId === null || !any) text = t('st_no_access');
    else if (!found) text = t('st_no_media');
    else if (!settings.enabled) text = t('st_off');
    else if (processed) { cls = 'ok'; text = t('st_processing', processed); }
    else if (reason) { cls = 'warn'; text = t('st_unsupported'); }
    else if (suspended) { cls = 'warn'; text = t('st_click'); }
    else text = playing ? t('st_waiting') : t('st_press_play');
    els.status.className = 'status ' + cls;
    els.statusText.textContent = text;

    els.notice.hidden = !reason;
    if (reason) {
      els.noticeText.textContent = reload ? t('n_reload') : t('n_original');
      els.retry.hidden = reason !== 'cached';
    }
  }

  // ───────────────────────── связь со страницей ─────────────────────────

  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (!msg || msg.type !== 'lv:status' || !sender.tab || sender.tab.id !== tabId) return;
    frames.set(sender.frameId, { s: msg, at: Date.now() });
    if (msg.top || !frames.has(0)) {
      if (Date.now() - speedTouched > 600 && msg.found) { speed = msg.speed; renderSpeed(); }
    }
    renderStatus();
  });

  // Пока popup открыт, раз в секунду спрашиваем фреймы о состоянии; закрыли — опрос
  // прекращается вместе со страницей popup, на странице ничего не крутится.
  function hello() {
    if (tabId === null) { renderStatus(); return; }
    chrome.tabs.sendMessage(tabId, { type: 'lv:hello' }).catch(() => {});
    setTimeout(renderStatus, 300);
  }

  function sendSpeed(v) {
    speed = LV.clampSpeed(v);
    speedTouched = Date.now();
    renderSpeed();
    if (tabId !== null) chrome.tabs.sendMessage(tabId, { type: 'lv:speed', speed }).catch(() => {});
  }

  // ───────────────────────── обработчики ─────────────────────────

  els.enabled.addEventListener('change', () => {
    settings.enabled = els.enabled.checked;
    renderSettings();
    chrome.storage.sync.set({ enabled: settings.enabled });
    setTimeout(hello, 150);
  });

  let levelTimer = 0;
  els.level.addEventListener('input', () => {
    settings.level = +els.level.value;
    renderSettings();
    // storage.sync ограничивает частоту записи — сохраняем не чаще, чем раз в 150 мс
    clearTimeout(levelTimer);
    levelTimer = setTimeout(() => chrome.storage.sync.set({ level: settings.level }), 150);
  });

  els.speed.addEventListener('input', () => sendSpeed(+els.speed.value));
  els.chips.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-speed]');
    if (b) sendSpeed(+b.dataset.speed);
  });

  els.retry.addEventListener('click', async () => {
    const r = await chrome.storage.local.get(CACHE_KEY);
    const map = Object.assign({}, r[CACHE_KEY]);
    for (const f of frames.values()) delete map[f.s.host];
    await chrome.storage.local.set({ [CACHE_KEY]: map });
    if (tabId !== null) chrome.tabs.reload(tabId);
    window.close();
  });

  // ───────────────────────── старт ─────────────────────────

  chrome.storage.sync.get(null, (all) => {
    settings = LV.normalize(all);
    renderSettings();
  });
  renderSettings();
  renderSpeed();

  // ?tab=<id> — открыть popup для конкретной вкладки (автотесты и скриншоты)
  const forced = +new URLSearchParams(location.search).get('tab');
  if (forced) {
    tabId = forced;
    hello();
    setInterval(hello, 1000);
  } else chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    // на служебных страницах (chrome://, магазин) content script не работает:
    // ответа не будет, и popup покажет «здесь расширение не работает»
    tabId = tab ? tab.id : null;
    hello();
    setInterval(hello, 1000);
  });
})();
