// Leveler — пресеты, профили сайтов и формат резервной копии.
// Обычный скрипт: подключается в content script, popup и странице настроек после defaults.js.
//
// В chrome.storage.sync:
//   enabled   — общий вкл/выкл
//   presets   — свои пресеты: [{ id: 'u:…', name, params }]
//   def       — профиль по умолчанию для сайтов без своих настроек
//   's:<host>'— профиль сайта: { preset, params, speed }
// В chrome.storage.local:
//   unsupportedHosts — сайты, где звук недоступен для обработки (см. content.js)
(() => {
  const LV = self.LV;
  const { clamp, num } = LV;

  // Все параметры звука. level — значение ползунка «Выровнять звук», если компрессор
  // задан им; null — компрессор настроен вручную.
  const SPEC = {
    level:     { min: 0, max: 100, def: 50, nullable: true },
    threshold: { min: -60, max: 0, def: -38 },     // dB
    knee:      { min: 0, max: 40, def: 17 },       // dB
    ratio:     { min: 1, max: 20, def: 6.5 },
    attack:    { min: 0, max: 0.5, def: 0.0115 },  // с
    release:   { min: 0.01, max: 1, def: 0.25 },   // с
    makeup:    { min: -12, max: 18, def: 0 },      // dB, поверх автоматического makeup компрессора
    hp:        { min: 0, max: 300, def: 0 },       // Гц, 0 — выключен
    low:       { min: -12, max: 12, def: 0 },      // dB, полка 120 Гц
    mid:       { min: -12, max: 12, def: 0 },      // dB, колокол 1.5 кГц
    high:      { min: -12, max: 12, def: 0 },      // dB, полка 8 кГц
    volume:    { min: 0, max: 400, def: 100 },     // %, усиление громкости; не часть пресета
    pan:       { min: -100, max: 100, def: 0 },    // панорама: −100 — всё влево, 100 — всё вправо
    balance:   { min: -100, max: 100, def: 0 },    // баланс: приглушает противоположный канал
    mono:      { bool: true, def: false }          // принудительное моно (L+R в оба канала)
  };
  const KEYS = Object.keys(SPEC);
  const COMP_KEYS = ['threshold', 'knee', 'ratio', 'attack', 'release'];
  // Настройки сайта, а не звука фильма: при выборе пресета остаются как были.
  const SITE_PARAMS = ['volume', 'pan', 'balance', 'mono'];

  function normalizeParams(p) {
    p = p && typeof p === 'object' ? p : {};
    const out = {};
    for (const k of KEYS) {
      const s = SPEC[k];
      if (s.nullable && p[k] === null) { out[k] = null; continue; }
      if (s.bool) { out[k] = typeof p[k] === 'boolean' ? p[k] : s.def; continue; }
      out[k] = Math.round(clamp(num(p[k], s.def), s.min, s.max) * 10000) / 10000;
    }
    return out;
  }

  // ползунок «Выровнять звук» → параметры компрессора (остальное не трогаем)
  function withLevel(params, level) {
    const c = LV.levelToParams(level);
    const out = Object.assign({}, params, { level: Math.round(clamp(level, 0, 100)) });
    for (const k of COMP_KEYS) out[k] = Math.round(c[k] * 10000) / 10000;
    return normalizeParams(out);
  }

  const P = (o) => Object.freeze(normalizeParams(o));
  // Встроенные пресеты. Имена — ключи _locales (pr_*).
  const BUILTIN = Object.freeze([
    { id: 'b:night', name: 'pr_night',
      params: P({ level: null, threshold: -50, knee: 8, ratio: 12, attack: 0.003, release: 0.3, makeup: 0, hp: 60, low: -3, mid: 2, high: 0 }) },
    { id: 'b:dialog', name: 'pr_dialog',
      params: P(Object.assign(withLevel({}, 50), { hp: 80, low: -2, mid: 4, high: 1 })) },
    { id: 'b:podcast', name: 'pr_podcast',
      params: P({ level: null, threshold: -42, knee: 10, ratio: 8, attack: 0.005, release: 0.2, makeup: 0, hp: 100, low: -4, mid: 3, high: 1 }) },
    { id: 'b:headphones', name: 'pr_headphones',
      params: P({ level: null, threshold: -30, knee: 20, ratio: 3, attack: 0.01, release: 0.3, makeup: -1, hp: 0, low: 1, mid: 0, high: -2 }) },
    { id: 'b:bass', name: 'pr_bass',
      params: P({ level: null, threshold: -24, knee: 20, ratio: 2.5, attack: 0.01, release: 0.25, makeup: -3, hp: 0, low: 6, mid: 0, high: 1 }) },
    { id: 'b:music', name: 'pr_music',
      params: P({ level: null, threshold: -20, knee: 30, ratio: 2, attack: 0.03, release: 0.3, makeup: 0, hp: 0, low: 1, mid: 0, high: 1 }) },
    { id: 'b:off', name: 'pr_off',
      params: P(Object.assign(withLevel({}, 0), { hp: 0, low: 0, mid: 0, high: 0 })) }
  ]);
  const DEFAULT_PRESET = 'b:off';        // после установки звук не трогаем, пока пользователь не выберет пресет

  const builtin = (id) => BUILTIN.find((b) => b.id === id) || null;

  const DEFAULT_PROFILE = Object.freeze({ preset: DEFAULT_PRESET, params: builtin(DEFAULT_PRESET).params, speed: 1 });

  function normalizeProfile(pr) {
    pr = pr && typeof pr === 'object' ? pr : {};
    return {
      preset: typeof pr.preset === 'string' ? pr.preset.slice(0, 40) : null,
      params: normalizeParams(pr.params || (builtin(pr.preset) || {}).params || DEFAULT_PROFILE.params),
      speed: LV.clampSpeed(num(pr.speed, 1))
    };
  }

  const MAX_PRESETS = 50;
  const MAX_NAME = 40;

  function normalizePresets(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const x of list) {
      if (!x || typeof x !== 'object') continue;
      const id = typeof x.id === 'string' && /^u:[\w-]{1,32}$/.test(x.id) ? x.id : null;
      const name = String(x.name || '').trim().slice(0, MAX_NAME);
      if (!id || !name || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name, params: normalizeParams(x.params) });
      if (out.length >= MAX_PRESETS) break;
    }
    return out;
  }

  const newId = () => 'u:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // «Выкл»: ничего не меняет — такой элемент даже не подключаем к Web Audio
  const isNeutral = (p) => p.ratio <= 1 && !p.makeup && !p.hp && !p.low && !p.mid && !p.high && p.volume === 100
    && !p.pan && !p.balance && !p.mono;

  // параметры пресета без настроек сайта (SITE_PARAMS) — те остаются от текущего профиля
  const presetParams = (preset, cur) => {
    const out = Object.assign({}, preset);
    for (const k of SITE_PARAMS) out[k] = cur[k];
    return normalizeParams(out);
  };

  const sameParams = (a, b) => KEYS.every((k) => {
    if (SITE_PARAMS.includes(k)) return true;
    if (a[k] === null || b[k] === null) return k === 'level' || a[k] === b[k];
    return Math.abs(a[k] - b[k]) < 1e-4;
  });

  // ───────── горячие клавиши ─────────
  // Значения — KeyboardEvent.key. По умолчанию [ и ] — медленнее/быстрее на 0.1, \\ — сброс на 1×.
  const DEFAULT_KEYS = Object.freeze({ slower: '[', faster: ']', reset: '\\', step: 0.1 });
  const KEY_STEPS = [0.05, 0.1, 0.25];
  function normalizeKeys(k) {
    k = k && typeof k === 'object' ? k : {};
    const out = {};
    for (const name in DEFAULT_KEYS) {
      const v = k[name];
      if (name === 'step') { out.step = KEY_STEPS.includes(v) ? v : DEFAULT_KEYS.step; continue; }
      out[name] = typeof v === 'string' && v.length > 0 && v.length <= 12 ? v : DEFAULT_KEYS[name];
    }
    return out;
  }

  // ───────── сайт ─────────

  const siteKey = (host) => 's:' + host;
  const isHost = (h) => typeof h === 'string' && h.length > 0 && h.length < 254 && /^[a-z0-9.\-[\]:]+$/.test(h);

  // Сайт, к которому относятся настройки: для iframe — сайт вкладки, а не самого фрейма.
  function topHost() {
    if (window === window.top) return LV.normHost(location.hostname);
    try { return LV.normHost(window.top.location.hostname); } catch (e) { /* чужой фрейм */ }
    const ao = location.ancestorOrigins;
    const origin = ao && ao.length ? ao[ao.length - 1] : document.referrer;
    try { return LV.normHost(new URL(origin).hostname); } catch (e) { return LV.normHost(location.hostname); }
  }

  // ───────── резервная копия ─────────

  function exportData(all) {
    const sites = {};
    for (const k in all) if (k.startsWith('s:') && isHost(k.slice(2))) sites[k.slice(2)] = normalizeProfile(all[k]);
    return {
      app: 'leveler',
      format: 1,
      exported: new Date().toISOString(),
      enabled: all.enabled !== false,
      liveCatchup: all.liveCatchup === true,
      presets: normalizePresets(all.presets),
      keys: normalizeKeys(all.keys),
      default: normalizeProfile(all.def || DEFAULT_PROFILE),
      sites
    };
  }

  // Проверяет и чистит файл резервной копии. Возвращает объект для storage.sync или бросает ошибку.
  function importData(data) {
    if (!data || data.app !== 'leveler' || typeof data.format !== 'number') throw new Error('not-leveler');
    if (data.format > 1) throw new Error('too-new');
    const out = {
      enabled: data.enabled !== false,
      liveCatchup: data.liveCatchup === true,
      presets: normalizePresets(data.presets),
      keys: normalizeKeys(data.keys),
      def: normalizeProfile(data.default)
    };
    const sites = data.sites && typeof data.sites === 'object' ? data.sites : {};
    let n = 0;
    for (const h in sites) {
      const host = LV.normHost(h);
      if (!isHost(host) || ++n > 250) continue;
      out[siteKey(host)] = normalizeProfile(sites[h]);
    }
    return out;
  }

  self.LV_PRESETS = Object.freeze({
    SPEC, KEYS, COMP_KEYS, SITE_PARAMS, BUILTIN, DEFAULT_PRESET, DEFAULT_PROFILE, MAX_PRESETS, MAX_NAME,
    normalizeParams, withLevel, isNeutral, presetParams, normalizeProfile, normalizePresets, builtin, newId, sameParams,
    DEFAULT_KEYS, KEY_STEPS, normalizeKeys, siteKey, isHost, topHost, exportData, importData
  });
})();
