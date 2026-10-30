(() => {
  const LV = self.LV;
  const PR = self.LV_PRESETS;
  const t = self.lvT;
  const $ = (s) => document.querySelector(s);
  const CACHE_KEY = 'unsupportedHosts';
  const STALE_MS = 2500;                   // ответ фрейма старше этого — фрейма больше нет
  const SAVE_MS = 400;                     // storage.sync ограничивает частоту записи
  const NOTICE = { drm: 'n_drm', cors: 'n_cors' };   // причина → пояснение под «Этот сайт не поддерживает…»

  // Ползунки компрессора и эквалайзера. scale — множитель для показа (с → мс).
  const COMP = [
    { key: 'threshold', label: 's_threshold', step: 1, unit: ' dB', digits: 0 },
    { key: 'ratio', label: 's_ratio', step: 0.5, fmt: (v) => v + ':1' },
    { key: 'knee', label: 's_knee', step: 1, unit: ' dB', digits: 0 },
    { key: 'attack', label: 's_attack', step: 0.001, scale: 1000, unit: ' ms' },
    { key: 'release', label: 's_release', step: 0.01, scale: 1000, unit: ' ms' },
    { key: 'makeup', label: 's_makeup', step: 0.5, unit: ' dB', signed: true }
  ];
  const EQ = [
    { key: 'hp', label: 's_hp', step: 10, unit: ' Hz', zero: 'u_off' },
    { key: 'low', label: 's_low', step: 0.5, unit: ' dB', signed: true },
    { key: 'mid', label: 's_mid', step: 0.5, unit: ' dB', signed: true },
    { key: 'high', label: 's_high', step: 0.5, unit: ' dB', signed: true }
  ];
  // center — двойной щелчок по ползунку возвращает в центр
  const side = (v) => (v === 0 ? t('u_center') : t(v < 0 ? 'u_left' : 'u_right', Math.abs(Math.round(v))));
  const STEREO = [
    { key: 'pan', label: 's_pan', step: 5, fmt: side, center: true },
    { key: 'balance', label: 's_balance', step: 5, fmt: side, center: true }
  ];

  let settings = LV.normalize();
  let all = {};                            // снимок storage.sync
  let site = null;                         // сайт вкладки (из ответа главного фрейма)
  let siteKnown = false;
  let profile = PR.normalizeProfile(PR.DEFAULT_PROFILE);
  let tabId = null;
  let speedTouched = 0;                    // пока ползунок двигают, не перезаписываем его ответами
  let editing = 0;                         // то же для параметров звука
  const frames = new Map();                // frameId → { s: статус, at: время }

  self.lvApplyI18n();
  $('#version').textContent = 'v' + chrome.runtime.getManifest().version;

  const els = {
    enabled: $('#enabled'), level: $('#level'), levelOut: $('#levelOut'), levelInfo: $('#levelInfo'),
    speed: $('#speed'), speedOut: $('#speedOut'), chips: $('#chips'),
    status: $('#status'), statusText: $('#statusText'),
    notice: $('#notice'), noticeText: $('#noticeText'), retry: $('#retry'),
    preset: $('#preset'), scope: $('#scope'), modified: $('#modified'),
    saveAs: $('#saveAs'), rename: $('#rename'), remove: $('#remove'),
    nameForm: $('#nameForm'), nameInput: $('#nameInput'), nameCancel: $('#nameCancel'),
    confirm: $('#confirm'), confirmText: $('#confirmText'), confirmYes: $('#confirmYes'), confirmNo: $('#confirmNo'),
    makeDefault: $('#makeDefault'), resetSite: $('#resetSite'), siteDone: $('#siteDone')
  };

  els.speed.min = LV.SPEED_MIN;
  els.speed.max = LV.SPEED_MAX;
  els.speed.step = LV.SPEED_STEP;

  const fill = (input) => {
    const p = (input.value - input.min) / (input.max - input.min) * 100;
    input.style.setProperty('--p', p + '%');
  };
  const fmtSpeed = (v) => (Math.round(v * 100) / 100) + '×';
  const minus = (s) => String(s).replace('-', '−');
  const fmtDb = (v) => minus(Math.round(v)) + ' dB';
  const r2 = (v) => Math.round(v * 100) / 100;

  // ───────────────────────── пресеты и профиль ─────────────────────────

  const customs = () => PR.normalizePresets(all.presets);
  const findPreset = (id) => PR.builtin(id) || customs().find((p) => p.id === id) || null;
  const presetName = (p) => (p.id.startsWith('b:') ? t(p.name) : p.name);
  const storeKey = () => (site ? PR.siteKey(site) : 'def');

  function currentProfile() {
    return PR.normalizeProfile((site && all[PR.siteKey(site)]) || all.def || PR.DEFAULT_PROFILE);
  }

  let saveTimer = 0;
  function saveProfile(now) {
    clearTimeout(saveTimer);
    const key = storeKey(), value = JSON.parse(JSON.stringify(profile));
    all[key] = value;
    const write = () => chrome.storage.sync.set({ [key]: value });
    if (now) write(); else saveTimer = setTimeout(write, SAVE_MS);
  }

  function sendParams() {
    if (tabId !== null) chrome.tabs.sendMessage(tabId, { type: 'lv:params', params: profile.params }).catch(() => {});
  }

  // изменение параметров ползунком: сразу на странице, в storage — с задержкой
  function changeParams(params) {
    profile.params = PR.normalizeParams(params);
    editing = Date.now();
    renderParams();
    renderPresets();
    sendParams();
    saveProfile(false);
  }

  function selectPreset(id) {
    const p = findPreset(id);
    if (!p) return;
    profile.preset = id;
    // усиление громкости и стерео не часть пресета: остаются как были
    profile.params = PR.presetParams(p.params, profile.params);
    renderAll();
    sendParams();
    saveProfile(true);
  }

  // ───────────────────────── отрисовка ─────────────────────────

  function renderPresets() {
    const sel = els.preset;
    sel.textContent = '';
    const group = (label, list) => {
      const g = document.createElement('optgroup');
      g.label = label;
      for (const p of list) g.appendChild(new Option(presetName(p), p.id));
      sel.appendChild(g);
    };
    group(t('p_builtin'), PR.BUILTIN);
    const mine = customs();
    if (mine.length) group(t('p_custom'), mine);
    const cur = findPreset(profile.preset);
    if (!cur) {
      sel.insertBefore(new Option(t('p_own_settings'), ''), sel.firstChild);
      sel.value = '';
    } else sel.value = cur.id;
    const custom = !!cur && cur.id.startsWith('u:');
    els.rename.disabled = els.remove.disabled = !custom;
    els.modified.hidden = !cur || PR.sameParams(cur.params, profile.params);
    els.scope.textContent = site ? site : t('p_scope_default');
    els.resetSite.hidden = !site || !all[PR.siteKey(site)];
    els.makeDefault.hidden = !site;
  }

  function renderParams() {
    const p = profile.params;
    const manual = p.level === null;
    els.level.value = manual ? 50 : p.level;
    els.level.classList.toggle('manual', manual);
    els.levelOut.textContent = manual ? t('p_level_manual') : p.level + '%';
    els.levelInfo.textContent = p.ratio <= 1 ? t('p_level_none')
      : t('p_level_info', fmtDb(p.threshold), r2(p.ratio) + ':1');
    fill(els.level);
    $('#mono').checked = p.mono;
    for (const s of COMP.concat(EQ, STEREO)) {
      const input = document.getElementById('sl-' + s.key);
      input.value = p[s.key];
      fill(input);
      document.getElementById('out-' + s.key).textContent = fmtValue(s, p[s.key]);
    }
  }

  function fmtValue(s, v) {
    if (s.zero && v === 0) return t(s.zero);
    if (s.fmt) return s.fmt(r2(v));
    const x = s.digits === 0 ? Math.round(v * (s.scale || 1)) : r2(v * (s.scale || 1));
    return minus((s.signed && x > 0 ? '+' : '') + x) + (s.unit || '');
  }

  function renderVolume() {
    const v = profile.params.volume;
    const input = $('#volume');
    input.value = v;
    fill(input);
    $('#volumeOut').textContent = Math.round(v) + '%';
    for (const b of $('#volChips').children) b.classList.toggle('on', +b.dataset.volume === Math.round(v));
  }

  function renderSettings() {
    els.enabled.checked = settings.enabled;
    document.body.classList.toggle('off', !settings.enabled);
  }

  function renderSpeed() {
    const v = profile.speed;
    els.speed.value = v;
    els.speedOut.textContent = fmtSpeed(v);
    fill(els.speed);
    for (const b of els.chips.children) b.classList.toggle('on', Math.abs(+b.dataset.speed - v) < 0.001);
  }

  function renderAll() {
    renderSettings();
    renderPresets();
    renderParams();
    renderSpeed();
    renderVolume();
  }

  function buildSliders(root, list) {
    for (const s of list) {
      const spec = PR.SPEC[s.key];
      const wrap = document.createElement('div');
      wrap.className = 'slider';
      wrap.innerHTML = '<div class="row"><label></label><output></output></div><input type="range">';
      const label = wrap.querySelector('label'), out = wrap.querySelector('output'), input = wrap.querySelector('input');
      label.textContent = t(s.label);
      label.htmlFor = input.id = 'sl-' + s.key;
      out.id = 'out-' + s.key;
      input.min = spec.min; input.max = spec.max; input.step = s.step;
      input.addEventListener('input', () => {
        const next = Object.assign({}, profile.params, { [s.key]: +input.value });
        if (PR.COMP_KEYS.includes(s.key)) next.level = null;   // компрессор настроен вручную
        changeParams(next);
      });
      if (s.center) input.addEventListener('dblclick', () => changeParams(Object.assign({}, profile.params, { [s.key]: 0 })));
      root.insertBefore(wrap, root.querySelector('.toggle'));
    }
  }
  buildSliders($('#compSliders'), COMP);
  buildSliders($('#eqSliders'), EQ);
  buildSliders($('#stereoSliders'), STEREO);
  $('#mono').addEventListener('change', (e) => changeParams(Object.assign({}, profile.params, { mono: e.target.checked })));

  function renderStatus() {
    const now = Date.now();
    let found = 0, playing = 0, processed = 0, reason = null, reload = false, suspended = false, any = false, drm = false;
    for (const [id, f] of frames) {
      if (now - f.at > STALE_MS) { frames.delete(id); continue; }
      any = true;
      const s = f.s;
      found += s.found; playing += s.playing; processed += s.processed;
      if (s.reason && (!reason || s.playing)) reason = s.reason;
      reload = reload || s.reload;
      drm = drm || (s.top && s.drmHost);
      if (s.audio === 'suspended' && s.found) suspended = true;
    }

    // сайт с DRM (Netflix и т.п.) известен заранее: предупреждаем, даже пока видео не нашлось
    if (!reason && drm) reason = 'drm';

    let cls = '', text;
    if (tabId === null || !any) text = t('st_no_access');
    else if (!found) text = t('st_no_media');
    else if (!settings.enabled) text = t('st_off');
    else if (PR.isNeutral(profile.params)) text = t('st_neutral');
    else if (processed) { cls = 'ok'; text = t('st_processing', processed); }
    else if (reason) { cls = 'warn'; text = t('st_unsupported'); }
    else if (suspended) { cls = 'warn'; text = t('st_click'); }
    else text = playing ? t('st_waiting') : t('st_press_play');
    els.status.className = 'status ' + cls;
    els.statusText.textContent = text;

    els.notice.hidden = !reason;
    if (reason) {
      els.noticeText.textContent = t(reload ? 'n_reload' : NOTICE[reason] || 'n_original');
      els.retry.hidden = reason !== 'cached';
    }
    // звук здесь не обработать: ползунки звука ничего не дадут, скорость остаётся
    document.body.classList.toggle('nosound', !!reason && !processed);
  }

  // ───────────────────────── связь со страницей ─────────────────────────

  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (!msg || msg.type !== 'lv:status' || !sender.tab || sender.tab.id !== tabId) return;
    frames.set(sender.frameId, { s: msg, at: Date.now() });
    if (msg.top && site === null && PR.isHost(msg.site)) {
      site = msg.site;
      profile = currentProfile();
      setKnown();
      renderAll();
    }
    if (msg.top && msg.found && Date.now() - speedTouched > 600 && Math.abs(msg.speed - profile.speed) > 0.001) {
      // сайт мог сменить скорость сам (собственный плеер): показываем фактическую
      els.speedOut.textContent = fmtSpeed(msg.speed);
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
    profile.speed = LV.clampSpeed(v);
    speedTouched = Date.now();
    renderSpeed();
    if (tabId !== null) chrome.tabs.sendMessage(tabId, { type: 'lv:speed', speed: profile.speed }).catch(() => {});
    if (site) saveProfile(false);
  }

  // ───────────────────────── обработчики ─────────────────────────

  els.enabled.addEventListener('change', () => {
    settings.enabled = els.enabled.checked;
    renderSettings();
    chrome.storage.sync.set({ enabled: settings.enabled });
    setTimeout(hello, 150);
  });

  els.level.addEventListener('input', () => changeParams(PR.withLevel(profile.params, +els.level.value)));

  els.speed.addEventListener('input', () => sendSpeed(+els.speed.value));
  els.chips.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-speed]');
    if (b) sendSpeed(+b.dataset.speed);
  });

  const setVolume = (v) => { changeParams(Object.assign({}, profile.params, { volume: v })); renderVolume(); };
  $('#volume').addEventListener('input', (e) => setVolume(+e.target.value));
  $('#volChips').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-volume]');
    if (b) setVolume(+b.dataset.volume);
  });
  $('#gear').addEventListener('click', () => { chrome.runtime.openOptionsPage(); window.close(); });

  els.preset.addEventListener('change', () => selectPreset(els.preset.value));

  // ── сохранить как / переименовать: одна и та же форма с полем имени ──
  let nameMode = null;
  function openName(mode) {
    nameMode = mode;
    els.confirm.hidden = true;
    const cur = findPreset(profile.preset);
    els.nameInput.value = mode === 'rename' && cur ? cur.name : '';
    els.nameInput.placeholder = t('p_name_ph');
    els.nameForm.hidden = false;
    els.nameInput.focus();
    els.nameInput.select();
  }
  const closeName = () => { els.nameForm.hidden = true; nameMode = null; };

  els.saveAs.addEventListener('click', () => openName('save'));
  els.rename.addEventListener('click', () => openName('rename'));
  els.nameCancel.addEventListener('click', closeName);
  els.nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = els.nameInput.value.trim().slice(0, PR.MAX_NAME);
    if (!name) return;
    const list = customs();
    if (nameMode === 'save') {
      if (list.length >= PR.MAX_PRESETS) { els.nameInput.setCustomValidity(t('p_too_many')); els.nameInput.reportValidity(); return; }
      const p = { id: PR.newId(), name, params: PR.normalizeParams(profile.params) };
      list.push(p);
      profile.preset = p.id;
    } else {
      const p = list.find((x) => x.id === profile.preset);
      if (p) p.name = name;
    }
    all.presets = list;
    chrome.storage.sync.set({ presets: list });
    saveProfile(true);
    closeName();
    renderPresets();
  });
  els.nameInput.addEventListener('input', () => els.nameInput.setCustomValidity(''));

  els.remove.addEventListener('click', () => {
    const cur = findPreset(profile.preset);
    if (!cur || !cur.id.startsWith('u:')) return;
    closeName();
    els.confirmText.textContent = t('p_delete_q', cur.name);
    els.confirm.hidden = false;
  });
  els.confirmNo.addEventListener('click', () => { els.confirm.hidden = true; });
  els.confirmYes.addEventListener('click', () => {
    const id = profile.preset;
    all.presets = customs().filter((p) => p.id !== id);
    chrome.storage.sync.set({ presets: all.presets });
    // параметры остаются, просто без пресета («Свои настройки»)
    profile.preset = null;
    saveProfile(true);
    els.confirm.hidden = true;
    renderPresets();
  });

  // короткое «Готово» рядом с кнопками сайта
  let flashTimer = 0;
  function flash(el) {
    el.hidden = false;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { el.hidden = true; }, 1200);
  }

  els.makeDefault.addEventListener('click', () => {
    all.def = { preset: profile.preset, params: profile.params, speed: 1 };
    chrome.storage.sync.set({ def: all.def });
    flash(els.siteDone);
  });

  els.resetSite.addEventListener('click', () => {
    if (!site) return;
    delete all[PR.siteKey(site)];
    chrome.storage.sync.remove(PR.siteKey(site));
    profile = currentProfile();
    renderAll();
    sendParams();
    if (tabId !== null) chrome.tabs.sendMessage(tabId, { type: 'lv:speed', speed: profile.speed }).catch(() => {});
    flash(els.siteDone);
  });

  els.retry.addEventListener('click', async () => {
    const r = await chrome.storage.local.get(CACHE_KEY);
    const map = Object.assign({}, r[CACHE_KEY]);
    for (const f of frames.values()) delete map[f.s.host];
    await chrome.storage.local.set({ [CACHE_KEY]: map });
    if (tabId !== null) chrome.tabs.reload(tabId);
    window.close();
  });

  $('#openOptions').addEventListener('click', () => { chrome.runtime.openOptionsPage(); window.close(); });

  // изменения из другой вкладки или со страницы настроек
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const k in changes) {
      if (changes[k].newValue === undefined) delete all[k];
      else all[k] = changes[k].newValue;
    }
    if (changes.enabled) settings = LV.normalize(all);
    if (Date.now() - editing > 1000 && Date.now() - speedTouched > 1000 && (changes.def || (site && changes[PR.siteKey(site)]))) {
      profile = currentProfile();
    }
    renderAll();
  });

  // ───────────────────────── старт ─────────────────────────

  renderAll();
  chrome.storage.sync.get(null, (r) => {
    all = r || {};
    settings = LV.normalize(all);
    profile = currentProfile();
    renderAll();
  });

  // Пока не знаем сайт вкладки, править нечего: без ответа страницы (chrome://, магазин)
  // через секунду ползунки правят общий профиль по умолчанию.
  function setKnown() {
    siteKnown = true;
    document.body.classList.remove('loading');
  }
  document.body.classList.add('loading');
  setTimeout(() => { if (!siteKnown) { setKnown(); renderAll(); } }, 1200);

  // Страница не ответила — скорее всего, вкладка была открыта до установки или обновления
  // расширения, и content script в ней нет. Внедряем его сами, без перезагрузки страницы.
  let injected = false;
  function injectIfSilent() {
    if (injected || tabId === null || [...frames.values()].some((f) => f.s.top)) return;
    injected = true;
    chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['shared/defaults.js', 'shared/presets.js', 'content/content.js']
    }).then(() => setTimeout(hello, 150), () => {});
  }

  // Индикатор уровня: спрашиваем страницу ~12 раз в секунду, только пока popup открыт.
  const meters = $('#meters'), mPre = $('#mPre'), mPost = $('#mPost');
  const shown = { pre: -90, post: -90 };
  const toScale = (db) => Math.max(0, Math.min(1, (db + 60) / 60));   // −60…0 dB
  function pollLevels() {
    if (tabId === null || document.hidden) return;
    chrome.tabs.sendMessage(tabId, { type: 'lv:levels' }).then((l) => {
      meters.classList.toggle('idle', !l);
      for (const k of ['pre', 'post']) {
        const v = l ? l[k] : -90;
        shown[k] = v > shown[k] ? v : shown[k] * 0.7 + v * 0.3;   // быстрый подъём, плавный спад
      }
      mPre.style.transform = `scaleX(${toScale(shown.pre)})`;
      mPost.style.transform = `scaleX(${toScale(shown.post)})`;
    }, () => meters.classList.add('idle'));
  }

  const start = () => {
    hello();
    setInterval(hello, 1000);
    setInterval(pollLevels, 80);
    setTimeout(injectIfSilent, 700);
  };
  // ?tab=<id> — открыть popup для конкретной вкладки (автотесты и скриншоты)
  const forced = +new URLSearchParams(location.search).get('tab');
  if (forced) {
    tabId = forced;
    start();
  } else chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    // на служебных страницах (chrome://, магазин) content script не работает:
    // ответа не будет, и popup покажет «здесь расширение не работает»
    tabId = tab ? tab.id : null;
    start();
  });
})();
