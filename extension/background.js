// Leveler — service worker. Нужен для двух вещей. Во-первых, после установки или обновления
// Chrome не запускает content script в уже открытых вкладках, пока их не перезагрузить.
// Внедряем его сами; новый скрипт забирает работу у старого (см. leveler-takeover в content.js).
// Во-вторых, рисует на иконке значок усиления громкости (ниже).
const api = globalThis.browser || chrome;
const FILES = ['shared/defaults.js', 'shared/presets.js', 'content/content.js'];

async function injectIntoOpenTabs() {
  let tabs = [];
  try { tabs = await api.tabs.query({ url: ['http://*/*', 'https://*/*', 'file:///*'] }); } catch (e) { return; }
  for (const tab of tabs) {
    if (tab.id == null || tab.discarded) continue;
    try {
      await api.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: FILES });
    } catch (e) { /* служебные страницы, магазин расширений и т.п. — пропускаем */ }
  }
}

api.runtime.onInstalled.addListener(() => { injectIntoOpenTabs(); });

// Значок на иконке: усиление громкости во вкладке, где звук сейчас обрабатывается.
// Текст присылает content.js, когда он меняется. Значок привязан к вкладке, и браузер
// сам убирает его при переходе на другую страницу.
const BOOST = '#12a66a', CUT = '#6b7280';
api.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'lv:badge' || !sender.tab || sender.tab.id == null) return;
  const tabId = sender.tab.id;
  const text = String(msg.text || '').slice(0, 4);
  const quiet = (p) => { if (p && p.catch) p.catch(() => {}); };   // вкладку могли уже закрыть
  quiet(api.action.setBadgeText({ tabId, text }));
  if (!text) return;
  quiet(api.action.setBadgeBackgroundColor({ tabId, color: msg.boost ? BOOST : CUT }));
  if (api.action.setBadgeTextColor) quiet(api.action.setBadgeTextColor({ tabId, color: '#fff' }));
});
