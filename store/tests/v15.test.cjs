'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');
const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); }, removeListener(fn) { this.listeners = this.listeners.filter((x) => x !== fn); } });
function storage(data, changed, fail) {
  const result = {};
  for (const area of ['sync','local','session']) result[area] = {
    get(keys, cb) { const value = structuredClone(keys == null ? data[area] : Object.fromEntries([].concat(keys).filter((k) => k in data[area]).map((k) => [k, data[area][k]]))); if (cb) cb(value); return Promise.resolve(value); },
    async set(values) { if (fail && fail(area)) throw new Error('quota'); const changes = {}; for (const k in values) { changes[k] = { oldValue: data[area][k], newValue: structuredClone(values[k]) }; data[area][k] = structuredClone(values[k]); } await changed(changes, area); },
    async remove(keys) { const changes = {}; for (const k of [].concat(keys)) { changes[k] = { oldValue: data[area][k] }; delete data[area][k]; } await changed(changes, area); }
  };
  result.onChanged = event(); return result;
}
function worker(data, changed = async () => {}, fail) {
  const api = { runtime: { onMessage: event(), onInstalled: event(), getURL: (p) => 'chrome-extension://test/' + p }, tabs: { onRemoved: event(), sendMessage: async () => {}, query: async () => [] }, action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} }, scripting: {} };
  api.storage = storage(data, changed, fail);
  vm.runInNewContext(source('extension/background.js'), { chrome: api, setTimeout, clearTimeout, console });
  return { api, message: (msg) => new Promise((resolve) => { const listener = api.runtime.onMessage.listeners.at(-1); const ret = listener(msg, { url: 'chrome-extension://test/popup/popup.html' }, resolve); if (ret !== true) resolve(); }) };
}
function helpers() {
  const self = {}; const context = vm.createContext({ self, URL, location: {}, window: {}, document: {} });
  for (const file of ['defaults','presets']) vm.runInContext(source('extension/shared/' + file + '.js'), context);
  return self;
}
test('legacy profiles keep audio enabled and backups round-trip focus settings and site bypass', () => {
  const { LV_PRESETS: P } = helpers();
  assert.equal(P.normalizeProfile({ speed: 1.5 }).audioEnabled, true);
  const all = { focusMode: 'duck', focusDuck: .3, 's:example.com': { audioEnabled: false, speed: 2 } };
  const restored = P.importData(P.exportData(all));
  assert.equal(restored.focusMode, 'duck'); assert.equal(restored.focusDuck, .3); assert.equal(restored['s:example.com'].audioEnabled, false);
});
test('background keeps the final profile after popup closes and reports failed persistence', async () => {
  const data = { sync: {}, local: {}, session: {} }, w = worker(data);
  const first = w.message({ type: 'lv:save-profile', key: 's:example.com', profile: { speed: 1.2 } });
  const last = w.message({ type: 'lv:save-profile', key: 's:example.com', profile: { speed: 1.5 } });
  assert.equal((await first).ok, true); assert.equal((await last).ok, true); assert.equal(data.sync['s:example.com'].speed, 1.5);
  const bad = worker(data, undefined, () => true);
  assert.equal((await bad.message({ type: 'lv:save-profile', key: 'def', profile: {}, immediate: true })).ok, false);
});
test('missing or invalidated runtime cannot take over existing audio', () => {
  for (const chrome of [undefined, {}, { runtime: {} }, { get runtime() { throw new Error('invalidated'); } }]) {
    const self = { LV: {}, LV_PRESETS: {} };
    vm.runInNewContext(source('extension/content/content.js'), { self, chrome });
  }
});
async function setup(t, lang = 'en') {
  const { LV_PRESETS: P } = helpers();
  const data = { sync: { def: P.normalizeProfile({ preset: 'b:dialog', params: P.builtin('b:dialog').params, speed: 1 }), 's:example.com': P.normalizeProfile({ preset:'b:music', params:P.builtin('b:music').params,speed:1.25 }) }, local: {}, session: {} };
  const wav = path.join('/tmp', 'leveler-v15-tone.wav'); execFileSync('python3', [path.join(__dirname, 'make_wav.py'), wav]);
  const server = http.createServer((req,res) => {
    if (req.url === '/tone.wav') { res.setHeader('Content-Type', 'audio/wav'); res.end(fs.readFileSync(wav)); return; }
    if (req.url === '/media') { res.setHeader('Content-Type','text/html'); res.end('<!doctype html><title>Media</title><button id="play">Play</button><video id="v" aria-label="Main video" src="/tone.wav" loop style="width:480px;height:270px"></video><audio id="a" aria-label="Second audio" src="/tone.wav" loop></audio><script>document.querySelector("#play").onclick=()=>{v.play();a.play()}</script>'); return; }
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html'); res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0,'127.0.0.1',r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'] });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const errors = []; context.on('page',(p) => p.on('pageerror',(e) => errors.push(e.message)));
  let mediaPage;
  const broadcast = async (changes, area) => {
    await Promise.all(context.pages().filter((p) => !p.isClosed()).map((p) => p.evaluate(({changes,area}) => window.__storageChanged?.forEach((fn) => fn(changes,area)), { changes,area }).catch(() => {})));
  };
  const w = worker(data, broadcast);
  await context.exposeBinding('bridge', async ({page}, msg) => {
    if (msg.kind === 'get') return w.api.storage[msg.area].get(msg.keys);
    if (msg.kind === 'set') return w.api.storage[msg.area].set(msg.values);
    if (msg.kind === 'remove') return w.api.storage[msg.area].remove(msg.keys);
    if (msg.kind === 'runtime') {
      if (msg.message.type === 'lv:save-profile') return w.message(msg.message);
      for (const p of context.pages()) if (p !== page && !p.isClosed()) await p.evaluate((m) => window.__messages?.forEach((fn) => fn(m,{tab:{id:1},frameId:0},()=>{})),msg.message);
      return;
    }
    if (msg.kind === 'tabs') {
      if (!mediaPage || mediaPage.isClosed()) return null;
      return mediaPage.evaluate((message) => new Promise((resolve) => {
        let answered = false;
        for (const fn of window.__messages || []) fn(message,{},(x) => { answered=true; resolve(x); });
        if (!answered) resolve(null);
      }), msg.message);
    }
  });
  const messages = JSON.parse(source('extension/_locales/'+lang+'/messages.json'));
  await context.addInitScript(({messages,lang}) => {
    window.__messages=[];window.__storageChanged=[];
    const event = (list) => ({ addListener(fn) { list.push(fn); }, removeListener(fn) { const i=list.indexOf(fn);if(i>=0)list.splice(i,1); } });
    const cb = (p,callback) => { if(callback)p.then(callback); return p; };
    const api = { runtime:{ id:'test', onMessage:event(window.__messages), sendMessage:(message)=>bridge({kind:'runtime',message}), getManifest:()=>({version:'1.5.0'}),getURL:(x)=>x,openOptionsPage:async()=>{} },
      storage:{onChanged:event(window.__storageChanged)},
      tabs:{query:(query,callback)=>cb(Promise.resolve([{id:1}]),callback),sendMessage:(id,message)=>bridge({kind:'tabs',message}),create:async()=>{},reload:async()=>{}},
      scripting:{executeScript:async()=>{}},
      i18n:{getUILanguage:()=>lang,getMessage:(key,subs=[])=>{let s=messages[key]?.message||key;[].concat(subs).forEach((x,i)=>s=s.replace('$'+(i+1),x));return s;} }
    };
    for(const area of ['sync','local','session'])api.storage[area]={get:(keys,callback)=>cb(bridge({kind:'get',area,keys}),callback),set:(values)=>bridge({kind:'set',area,values}),remove:(keys)=>bridge({kind:'remove',area,keys})};
    window.chrome=api;
  },{messages,lang});
  const base = 'http://127.0.0.1:' + server.address().port;
  mediaPage=await context.newPage(); await mediaPage.goto(base+'/media');
  for(const name of ['shared/defaults.js','shared/presets.js','content/content.js'])await mediaPage.addScriptTag({path:path.join(ROOT,'extension',name)});
  await mediaPage.locator('#play').click();
  await mediaPage.waitForFunction(()=>__leveler.ctx?.state==='running'&&__leveler.chains.has(document.querySelector('video')));
  return { context,mediaPage,base,data,errors };
}
test('audio comparison expires, site bypass preserves speed, source meters and video relocation reuse the chain', async(t)=>{
  const {mediaPage:p,errors}=await setup(t);
  const message=(msg)=>p.evaluate((msg)=>new Promise((resolve)=>{for(const fn of __messages)fn(msg,{},resolve);resolve(null)}),msg);
  await message({type:'lv:compare',original:true});
  await p.waitForFunction(()=>__leveler.chains.get(v).dry.gain.value>.99);
  await p.waitForFunction(()=>__leveler.chains.get(v).wet.gain.value>.99, {timeout:5000});
  const ids=await p.evaluate(()=>__leveler.status().sources.map((s)=>s.id));
  assert.equal(ids.length,2);
  const levels=await message({type:'lv:levels',id:ids[1]});assert.equal(levels.id,ids[1]);assert.equal(typeof levels.reduction,'number');
  await message({type:'lv:params',params:await p.evaluate(()=>__leveler.params),audioEnabled:false});
  await message({type:'lv:speed',speed:1.5});
  await p.waitForFunction(()=>__leveler.chains.get(v).dry.gain.value>.99);
  assert.equal(await p.locator('#v').evaluate((v)=>v.playbackRate),1.5);
  await p.evaluate(()=>{window.originalChain=__leveler.chains.get(v); const host=document.createElement('div');host.id='floating';const root=host.attachShadow({mode:'open'});document.body.append(host);v.setAttribute('data-video-drift','floating');root.append(v)});
  await p.evaluate(()=>{const video=document.querySelector('#floating').shadowRoot.querySelector('video');document.body.append(video);video.removeAttribute('data-video-drift');document.querySelector('#floating').remove();video.play()});
  assert.equal(await p.evaluate(()=>__leveler.chains.get(v)===originalChain),true);
  await p.evaluate(async()=>{window.mediaVideo=v;window.childPlayer=window.open('about:blank','lv-handoff');childPlayer.document.body.append(mediaVideo);await mediaVideo.play()});
  await p.evaluate(async()=>{document.body.append(mediaVideo);childPlayer.close();await mediaVideo.play()});
  assert.equal(await p.evaluate(()=>__leveler.chains.get(mediaVideo)===originalChain),true);
  assert.equal(await p.evaluate(()=>__leveler.ctx.state),'running');
  // A new script instance takes over the same source without double connecting it.
  await p.addScriptTag({path:path.join(ROOT,'extension/content/content.js')});
  assert.equal(await p.evaluate(()=>__leveler.chains.get(v)===originalChain),true);
  assert.deepEqual(errors,[]);
});
for(const lang of ['en','ru','uk'])test('popup and profile editor: '+lang,async(t)=>{
  const {context,base,data,errors}=await setup(t,lang);
  const p=await context.newPage();await p.goto(base+'/extension/popup/popup.html?tab=1');
  await p.waitForFunction(()=>document.querySelector('#scope').textContent==='127.0.0.1');
  await p.locator('#volume').evaluate((el)=>{el.value=175;el.dispatchEvent(new Event('input',{bubbles:true}))});
  await p.locator('#compare').click();
  await p.close();
  await new Promise((r)=>setTimeout(r,650));
  assert.equal(data.sync['s:127.0.0.1'].params.volume,175);
  const popup=await context.newPage();await popup.goto(base+'/extension/popup/popup.html?tab=1');
  await popup.waitForFunction(()=>document.querySelector('#volume').value==='175');
  await popup.locator('#resetStereo').click();await popup.locator('#undo').click();
  await popup.evaluate(()=>window.scrollTo(0,0));
  await popup.screenshot({path:'/tmp/leveler-popup-'+lang+'.png'});
  await popup.emulateMedia({colorScheme:'dark'});await popup.screenshot({path:'/tmp/leveler-popup-'+lang+'-dark.png',animations:'disabled'});
  assert.equal(await popup.locator('#meterSource option').count(),3);
  const options=await context.newPage();await options.goto(base+'/extension/options/options.html');
  await options.locator('#siteSearch').fill('example.com');
  await options.locator('#sites li').first().waitFor();
  await options.locator('#sites li > button').last().click();
  await options.locator('.site-editor input[type=number]').first().fill('1.75');
  await options.locator('.site-editor button[type=submit]').click();
  await options.waitForFunction(()=>!document.querySelector('.site-editor'));
  assert.equal(data.sync['s:example.com'].speed,1.75);
  await options.locator('#sites li > button').last().click();
  await options.locator('.site-editor input[type=text]').fill('copied.example');
  await options.locator('.site-editor button[type=button]').click();
  await options.waitForFunction(()=>!document.querySelector('.site-editor'));
  assert.equal(data.sync['s:copied.example'].speed,1.75);
  await options.locator('#siteSearch').fill('');await options.locator('#sites li > button').last().click();await options.screenshot({path:'/tmp/leveler-options-'+lang+'.png'});
  assert.deepEqual(errors,[]);
});
