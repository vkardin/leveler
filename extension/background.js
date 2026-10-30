// Leveler — фоновый скрипт. Две задачи:
//  1. После установки или обновления Chrome не запускает content script в уже открытых
//     вкладках, пока их не перезагрузить. Внедряем его сами; новый скрипт забирает работу
//     у старого (см. leveler-takeover в content.js).
//  2. AudioFocus (по умолчанию выключен): когда звук включают в активной вкладке, остальные
//     вкладки со звуком ставятся на паузу или приглушаются, а когда он стихает — продолжают.
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

// ───────────────────────── AudioFocus ─────────────────────────
//
// Каждый фрейм сам следит за своими <video>/<audio> и присылает lv:audible, когда звук
// у него появился или пропал. claim — звук включили во вкладке, которую сейчас видно:
// она становится владельцем фокуса, остальные звучащие вкладки получают lv:focus pause/duck.
// Владелец замолчал (пауза, конец, закрыли вкладку) — через RESTORE_MS остальные получают
// restore: пауза снимается только с того, что поставили на паузу мы, громкость возвращается.
//
// Service worker засыпает через полминуты простоя, поэтому состояние лежит в storage.session.

const RESTORE_MS = 1500;     // короткая пауза (реклама → видео, перемотка) не будит фоновые вкладки
const STATE_KEY = 'focus';

let state = null;            // { owner, playing: { tabId: [frameId] }, held: { tabId: 'pause'|'duck' } }
let mode = 'off';
let queue = Promise.resolve();
let restoreTimer = 0;

// события обрабатываются строго по очереди: иначе два быстрых сообщения затрут состояние друг друга
const run = (fn) => { queue = queue.then(fn).catch(() => {}); return queue; };

async function load() {
  if (state) return state;
  const [s, sync] = await Promise.all([
    api.storage.session.get(STATE_KEY).catch(() => ({})),
    api.storage.sync.get('focusMode').catch(() => ({}))
  ]);
  if (!state) {
    mode = ['pause', 'duck'].includes(sync.focusMode) ? sync.focusMode : 'off';
    state = Object.assign({ owner: null, playing: {}, held: {} }, s && s[STATE_KEY]);
  }
  return state;
}

const save = () => api.storage.session.set({ [STATE_KEY]: state }).catch(() => {});
const send = (tabId, action) => api.tabs.sendMessage(tabId, { type: 'lv:focus', action }).catch(() => {});

function hold(tabId) {
  state.held[tabId] = mode;
  send(tabId, mode);
}

function release() {
  for (const id in state.held) send(+id, 'restore');
  state.held = {};
  state.owner = null;
}

function scheduleRestore() {
  clearTimeout(restoreTimer);
  restoreTimer = setTimeout(() => run(async () => {
    await load();
    if (state.owner != null && state.playing[state.owner]) return;   // владелец снова звучит
    release();
    await save();
  }), RESTORE_MS);
}

function onAudible(msg, sender) {
  const tab = sender.tab && sender.tab.id;
  if (tab == null || tab < 0) return;
  run(async () => {
    await load();
    const frames = new Set(state.playing[tab] || []);
    if (msg.playing) frames.add(sender.frameId || 0);
    else frames.delete(sender.frameId || 0);
    if (frames.size) state.playing[tab] = [...frames];
    else delete state.playing[tab];

    if (mode !== 'off' && msg.playing) {
      if (msg.claim) {
        state.owner = tab;
        clearTimeout(restoreTimer);
        if (state.held[tab]) { delete state.held[tab]; send(tab, 'restore'); }
        for (const id in state.playing) if (+id !== tab) hold(+id);
      } else if (state.owner != null && state.owner !== tab && state.playing[state.owner]) {
        hold(tab);   // фоновая вкладка заиграла сама (следующий трек), пока владелец звучит
      }
    }
    if (!frames.size && tab === state.owner) scheduleRestore();
    await save();
  });
}

api.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'lv:audible') onAudible(msg, sender);
});

api.tabs.onRemoved.addListener((tabId) => run(async () => {
  await load();
  const known = state.playing[tabId] || state.held[tabId] || state.owner === tabId;
  if (!known) return;
  delete state.playing[tabId];
  delete state.held[tabId];
  if (state.owner === tabId) scheduleRestore();
  await save();
}));

api.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes.focusMode) return;
  run(async () => {
    await load();
    const next = ['pause', 'duck'].includes(changes.focusMode.newValue) ? changes.focusMode.newValue : 'off';
    if (next === mode) return;
    // режим сменили: всё, что держали, отпускаем; новый режим сработает со следующего claim
    mode = next;
    release();
    await save();
  });
});
