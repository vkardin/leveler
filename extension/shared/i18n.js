// Мини-обёртка над chrome.i18n для страниц расширения.
(() => {
  const t = (key, ...subs) => chrome.i18n.getMessage(key, subs.map(String)) || key;

  // data-i18n="key"        → textContent
  // data-i18n-title="key"  → title
  const apply = (root) => {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    document.documentElement.lang = chrome.i18n.getUILanguage();
  };

  self.lvT = t;
  self.lvApplyI18n = apply;
})();
