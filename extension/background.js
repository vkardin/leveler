// Leveler — service worker. Нужен только для одного: после установки или обновления
// Chrome не запускает content script в уже открытых вкладках, пока их не перезагрузить.
// Внедряем его сами; новый скрипт забирает работу у старого (см. leveler-takeover в content.js).
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
