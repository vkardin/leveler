// Leveler — общие настройки и звуковая математика.
// Обычный скрипт (не ES-модуль): content script в Manifest V3 модулем быть не может,
// поэтому этот файл подключается и в content script, и в popup и кладёт всё в self.LV.
(() => {
  // Общие настройки. Пресет, параметры звука и скорость — в профиле сайта (presets.js).
  const DEFAULTS = Object.freeze({
    enabled: true,      // false — bypass: оригинальный звук, цепочка остаётся подключённой
    focusMode: 'off',   // AudioFocus: 'off' | 'pause' | 'duck' — что делать с фоновыми вкладками
    focusDuck: 0.2,     // громкость фоновых вкладок в режиме 'duck' (доля от исходной)
    liveCatchup: false  // догонять прямой эфир, если отстали от края буфера
  });

  const FOCUS_MODES = ['off', 'pause', 'duck'];
  const FOCUS_DUCKS = [0.1, 0.2, 0.3, 0.5];

  const SPEED_MIN = 0.25;
  const SPEED_MAX = 4;
  const SPEED_STEP = 0.05;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const normHost = (h) => String(h || '').toLowerCase().replace(/^www\./, '');

  function normalize(s) {
    s = s || {};
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULTS.enabled,
      focusMode: FOCUS_MODES.includes(s.focusMode) ? s.focusMode : DEFAULTS.focusMode,
      focusDuck: FOCUS_DUCKS.includes(s.focusDuck) ? s.focusDuck : DEFAULTS.focusDuck,
      liveCatchup: typeof s.liveCatchup === 'boolean' ? s.liveCatchup : DEFAULTS.liveCatchup
    };
  }

  function clampSpeed(v) {
    return Math.round(clamp(num(v, 1), SPEED_MIN, SPEED_MAX) * 100) / 100;
  }

  // Один ползунок «Выровнять звук» → параметры DynamicsCompressorNode (только компрессор).
  // 0 — звук не меняется (ratio 1:1), 100 — сильное сжатие, как «ночной режим».
  // По спецификации Web Audio компрессор сам добавляет автоматический makeup
  // (≈0.6 от того, что он срезает с полного уровня), поэтому тихое уже становится
  // громче, а громкие пики остаются ниже 0 dBFS.
  function levelToParams(level) {
    const a = clamp(num(level, 0), 0, 100) / 100;
    return {
      threshold: -10 - 40 * Math.sqrt(a),    // −10 … −50 dB; порог быстро опускается до уровня диалогов
      knee: 24 - 14 * a,                     // мягче на малых значениях
      ratio: 1 + 11 * a,                     // 1:1 … 12:1
      attack: 0.003 + 0.017 * (1 - a),       // 20 мс → 3 мс
      release: 0.25
    };
  }

  self.LV = Object.freeze({
    DEFAULTS, FOCUS_MODES, FOCUS_DUCKS, SPEED_MIN, SPEED_MAX, SPEED_STEP,
    clamp, num, normHost, normalize, clampSpeed, levelToParams
  });
})();
