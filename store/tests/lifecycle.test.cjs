'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A retired content script must stop reacting to media events after a takeover.
test('takeover removes old media handlers and delayed speed writes', async () => {
  const media = new EventTarget();
  Object.assign(media, { paused: true, volume: 1, muted: false, playbackRate: 1, isConnected: true });
  const document = new EventTarget();
  document.querySelectorAll = () => [media];
  document.visibilityState = 'visible';
  const window = new EventTarget();
  window.top = window;
  const listeners = () => ({ addListener() {}, removeListener() {} });
  const chrome = { runtime: { id: 'test', onMessage: listeners(), sendMessage: async () => {} }, storage: {
    sync: { get() {}, set: async () => { writes++; } }, local: { get() {} }, onChanged: listeners(),
  } };
  let writes = 0;
  const context = vm.createContext({ self: {}, window, document, chrome, Event, AbortController,
    HTMLVideoElement: class {}, HTMLMediaElement: { [Symbol.hasInstance]: el => el === media },
    location: { hostname: 'example.com' }, URL, setTimeout, clearTimeout, setInterval, clearInterval,
    MutationObserver: class { observe() {} disconnect() {} },
  });
  const root = path.resolve(__dirname, '../../extension');
  for (const file of ['shared/defaults.js', 'shared/presets.js', 'content/content.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  }
  // Schedule a speed save, then retire this instance before its debounce expires.
  const key = new Event('keydown');
  Object.assign(key, { key: ']', composedPath: () => [] });
  window.dispatchEvent(key);
  window.dispatchEvent(new Event('leveler-takeover'));
  // This invokes onDuration in a stale instance unless its handler was removed.
  Object.defineProperty(media, 'duration', { get() { throw new Error('retired handler ran'); } });
  media.dispatchEvent(new Event('durationchange'));
  await new Promise(resolve => setTimeout(resolve, 650));
  assert.equal(writes, 0);
});
