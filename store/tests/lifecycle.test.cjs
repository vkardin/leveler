'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../extension');
const sources = ['shared/defaults.js', 'shared/presets.js', 'content/content.js']
  .map(file => fs.readFileSync(path.join(root, file), 'utf8'));

// A minimal page with one media element; content.js can be injected into it several times,
// like after an extension update.
function page({ ctx = null } = {}) {
  const media = new EventTarget();
  Object.assign(media, { paused: true, volume: 1, muted: false, playbackRate: 1, readyState: 0, isConnected: true });
  const document = new EventTarget();
  document.querySelectorAll = () => [media];
  document.visibilityState = 'visible';
  const window = new EventTarget();
  window.top = window;
  if (ctx) window.__lvAudio = { ctx, chains: new WeakMap() };
  const listeners = () => ({ addListener() {}, removeListener() {} });
  const state = { writes: 0 };
  const chrome = { runtime: { id: 'test', onMessage: listeners(), sendMessage: async () => {} }, storage: {
    sync: { get() {}, set: async () => { state.writes++; } }, local: { get() {} }, onChanged: listeners(),
  } };
  const context = vm.createContext({ self: {}, window, document, chrome, Event, AbortController, queueMicrotask,
    HTMLVideoElement: class {}, HTMLMediaElement: { [Symbol.hasInstance]: el => el === media },
    location: { hostname: 'example.com' }, URL, setTimeout, clearTimeout, setInterval, clearInterval,
    MutationObserver: class { observe() {} disconnect() {} },
  });
  const inject = () => { for (const src of sources) vm.runInContext(src, context); };
  return { media, window, state, inject };
}

// A retired content script must stop reacting to media events after a takeover.
test('takeover removes old media handlers and delayed speed writes', async () => {
  const { media, window, state, inject } = page();
  inject();
  // Schedule a speed save, then retire this instance before its debounce expires.
  const key = new Event('keydown');
  Object.assign(key, { key: ']', composedPath: () => [] });
  window.dispatchEvent(key);
  window.dispatchEvent(new Event('leveler-takeover'));
  // This invokes onDuration in a stale instance unless its handler was removed.
  Object.defineProperty(media, 'duration', { get() { throw new Error('retired handler ran'); } });
  media.dispatchEvent(new Event('durationchange'));
  await new Promise(resolve => setTimeout(resolve, 650));
  assert.equal(state.writes, 0);
});

// The AudioContext outlives the script that created it: each instance must listen to it
// itself and drop its listener when it is replaced.
test('shared AudioContext listeners follow the active instance', () => {
  const ctx = new EventTarget();
  ctx.state = 'suspended';
  let active = 0;
  const add = ctx.addEventListener.bind(ctx);
  ctx.addEventListener = (type, fn, opts) => {
    if (type !== 'statechange') return add(type, fn, opts);
    active++;
    opts && opts.signal && opts.signal.addEventListener('abort', () => { active--; });
    add(type, fn, opts);
  };
  const { inject } = page({ ctx });
  inject();
  assert.equal(active, 1, 'first instance listens to the inherited context');
  inject();
  assert.equal(active, 1, 'takeover replaces the listener instead of stacking it');
});
