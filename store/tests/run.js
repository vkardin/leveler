// Автотест Leveler в настоящем Chromium с загруженным расширением.
//
//   node store/tests/run.js [папка-для-скриншотов]
//
// Нужен пакет playwright (npm i playwright). Поднимает два локальных сервера
// (разные origin) и проверяет на сгенерированном звуке (make_wav.py):
//  - цепочка подключается после действия пользователя, громкость выравнивается;
//  - bypass (выключение) без перезагрузки;
//  - видео, добавленное позже, и <audio> во iframe;
//  - элемент не подключается дважды;
//  - скорость с preservesPitch и оверлей;
//  - чужой origin без CORS не трогается;
//  - тишина после подключения (редирект на чужой origin) распознаётся и сайт запоминается;
//  - AudioFocus: пауза и приглушение фоновых вкладок, возврат, когда активная замолчала.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const EXT = path.resolve(__dirname, '../../extension');
const SHOTS = process.argv[2] || null;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'leveler-test-'));
const WAV = path.join(tmp, 't.wav');
execFileSync('python3', [path.join(__dirname, 'make_wav.py'), WAV]);

const A = 8711, B = 8712;            // localhost:A — «сайт», 127.0.0.1:B — чужой origin
const page = (body) => `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111;color:#eee;font:14px sans-serif">${body}</body>`;
const ROUTES = {
  '/': page(`<video id="v" src="/t.wav" width="480" height="270" style="background:#000"></video>
    <iframe id="f" src="http://127.0.0.1:${A}/frame" width="300" height="60" style="border:0"></iframe>`),
  '/frame': page('<audio id="a" src="/t.wav" controls></audio>'),
  '/cors': page(`<video id="v" src="http://127.0.0.1:${B}/t.wav" width="480" height="270"></video>`),
  '/redirect': page('<video id="v" src="/redir.wav" width="480" height="270"></video>')
};
function server(port) {
  return http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (u === '/t.wav') {
      const data = fs.readFileSync(WAV);
      const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
      if (!m) {
        res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': data.length, 'Accept-Ranges': 'bytes' });
        return res.end(data);
      }
      const from = +m[1], to = m[2] ? +m[2] : data.length - 1;
      res.writeHead(206, { 'Content-Type': 'audio/wav', 'Content-Length': to - from + 1, 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${from}-${to}/${data.length}` });
      return res.end(data.subarray(from, to + 1));
    }
    if (u === '/redir.wav') { res.writeHead(302, { Location: `http://127.0.0.1:${B}/t.wav` }); return res.end(); }
    if (ROUTES[u]) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(ROUTES[u]); }
    res.writeHead(404); res.end();
  }).listen(port);
}

let failed = 0;
const ok = (cond, msg, extra) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + msg + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
  if (!cond) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Выполнить код в изолированном мире content script (там, где self.__leveler):
// главного фрейма или iframe, в адресе которого есть frameUrlPart.
async function isolated(p, frameUrlPart) {
  // iframe с другого сайта живёт в своём процессе: ему нужна своя CDP-сессия
  const fr = frameUrlPart && p.frames().find((f) => f.url().includes(frameUrlPart));
  let cdp;
  try { cdp = await p.context().newCDPSession(fr || p); } catch (e) { cdp = await p.context().newCDPSession(p); }
  const ctxs = [];
  cdp.on('Runtime.executionContextCreated', (e) => ctxs.push(e.context));
  await cdp.send('Runtime.enable');
  const { frameTree } = await cdp.send('Page.getFrameTree');
  await sleep(200);
  const walk = (n) => [n.frame].concat((n.childFrames || []).flatMap(walk));
  const target = frameUrlPart ? walk(frameTree).find((f) => f.url.includes(frameUrlPart)) : frameTree.frame;
  const c = target && ctxs.find((x) => x.auxData && x.auxData.type === 'isolated' && x.auxData.frameId === target.id);
  if (!c) throw new Error('нет изолированного мира расширения');
  return async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, contextId: c.id, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
    return r.result.value;
  };
}

// id вкладки без разрешения tabs: content script шлёт сообщение, страница расширения видит sender.tab.
async function tabIdOf(ctx, extId, iso) {
  const pp = await ctx.newPage();
  await pp.goto(`chrome-extension://${extId}/popup/popup.html`);
  const got = pp.evaluate(() => new Promise((r) => chrome.runtime.onMessage.addListener((m, s) => { if (m.type === 'test:whoami') r(s.tab.id); })));
  await sleep(200);
  await iso('chrome.runtime.sendMessage({ type: "test:whoami" }).catch(() => {})');
  const id = await got;
  await pp.close();
  return id;
}

// Средний уровень (dBFS) до и после обработки за `ms` миллисекунд.
const MEASURE = (ms) => `(async () => {
  const el = document.getElementById('v');
  const c = __leveler.chains.get(el);
  const post = c.src.context.createAnalyser();
  post.fftSize = 2048;
  c.wet.connect(post);
  const dry = c.src.context.createAnalyser();
  dry.fftSize = 2048;
  c.dry.connect(dry);
  const buf = new Float32Array(2048);
  const rms = (a) => { a.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return s / buf.length; };
  let a = 0, b = 0, d = 0, n = 0;
  const end = performance.now() + ${ms};
  while (performance.now() < end) {
    await new Promise((r) => setTimeout(r, 40));
    a += rms(c.probe); b += rms(post); d += rms(dry); n++;
  }
  c.wet.disconnect(post); c.dry.disconnect(dry);
  const db = (x) => Math.round(10 * Math.log10(x / n + 1e-12) * 10) / 10;
  return { pre: db(a), post: db(b), dry: db(d), t: Math.round(el.currentTime * 10) / 10 };
})()`;

(async () => {
  const sa = server(A), sb = server(B);
  const ctx = await chromium.launchPersistentContext(path.join(tmp, 'profile'), {
    channel: 'chromium',
    headless: true,
    viewport: { width: 900, height: 600 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  try {
    // ── 1. обычная страница ──
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`http://localhost:${A}/`);
    await sleep(500);
    const iso = await isolated(p);
    // после установки пресет «Выкл»: для проверок обработки включаем «Диалоги громче» по умолчанию
    await iso(`chrome.storage.sync.set({ def: { preset: 'b:dialog', speed: 1, params: LV_PRESETS.builtin('b:dialog').params } })`);
    await sleep(200);

    let st = await iso('__leveler.status()');
    ok(st.found >= 1 && st.processed === 0 && st.audio === 'none', 'до запуска видео элемент найден, но не подключён', st);

    await p.mouse.click(700, 400);   // действие пользователя
    await p.evaluate(() => document.getElementById('v').play());
    await sleep(800);
    st = await iso('__leveler.status()');
    ok(st.processed === 1 && st.audio === 'running', 'после клика и play цепочка подключена', st);

    // тихий участок: 0–3 с, громкий: 3–6 с
    await p.evaluate(() => { document.getElementById('v').currentTime = 1; });
    await sleep(300);
    const quiet = await iso(MEASURE(1200));
    await p.evaluate(() => { document.getElementById('v').currentTime = 3.6; });
    await sleep(500);
    const loud = await iso(MEASURE(1200));
    const before = loud.pre - quiet.pre, after = loud.post - quiet.post;
    console.log('       уровень 50%: тихо', quiet, 'громко', loud);
    ok(before > 30 && after < before / 2, `разница тихо/громко сжата: ${before.toFixed(1)} dB → ${after.toFixed(1)} dB`);
    ok(loud.post < -0.5, 'громкий участок не клипует', loud.post);
    ok(quiet.post > quiet.pre + 6, 'тихий участок стал громче', [quiet.pre, quiet.post]);

    // сильнее «выровнять» → разница ещё меньше
    await iso(`chrome.storage.sync.set({ 's:localhost': { preset: null, speed: 1,
      params: LV_PRESETS.withLevel(LV_PRESETS.DEFAULT_PROFILE.params, 100) } })`);
    await sleep(400);
    await p.evaluate(() => { document.getElementById('v').currentTime = 1; });
    await sleep(500);
    const q100 = await iso(MEASURE(1000));
    await p.evaluate(() => { document.getElementById('v').currentTime = 3.6; });
    await sleep(500);
    const l100 = await iso(MEASURE(1000));
    const after100 = l100.post - q100.post;
    ok(after100 < after, `уровень 100%: разница ${after100.toFixed(1)} dB (меньше, чем на 50%)`, [q100, l100]);
    await iso('chrome.storage.sync.remove("s:localhost")');

    // ── 2. bypass ──
    await iso('chrome.storage.sync.set({ enabled: false })');
    await sleep(500);
    const off = await iso(MEASURE(600));
    ok(off.post < -80 && off.dry > off.pre - 1, 'выключено: обработанный путь молчит, звук идёт напрямую', off);
    st = await iso('__leveler.status()');
    ok(st.processed === 1, 'выключение не отключает элемент и не требует перезагрузки', st);
    await iso('chrome.storage.sync.set({ enabled: true })');
    await sleep(500);
    const on = await iso(MEASURE(600));
    ok(on.post > on.pre && on.dry < -80, 'снова включено без перезагрузки', on);

    // ── 3. повторный play того же элемента, новое видео, iframe ──
    await p.evaluate(async () => {
      const v = document.getElementById('v');
      v.pause(); await v.play(); v.pause(); await v.play();
    });
    await p.evaluate(() => {
      setTimeout(() => {
        const v2 = document.createElement('video');
        v2.id = 'v2'; v2.src = '/t.wav'; v2.width = 200;
        document.body.appendChild(v2);
        v2.play();
      }, 300);
    });
    await sleep(1200);
    st = await iso('__leveler.status()');
    ok(st.processed === 2 && st.found === 2 && !st.reason, 'видео, добавленное позже, подключено; первое не подключено второй раз', st);
    ok(errors.length === 0, 'нет ошибок на странице', errors);

    const frame = p.frames().find((f) => f.url().endsWith('/frame'));
    await frame.click('audio');
    await frame.evaluate(() => document.getElementById('a').play());
    await sleep(800);

    // ── 4. popup и скорость ──
    const extId = await iso('chrome.runtime.id');
    const tabId = await tabIdOf(ctx, extId, iso);
    // ── 4-. повторное внедрение (как после обновления расширения): новый экземпляр забирает работу ──
    const probePage = await ctx.newPage();
    await probePage.goto(`chrome-extension://${extId}/options/options.html`);
    await probePage.evaluate((id) => chrome.scripting.executeScript({ target: { tabId: id, allFrames: true },
      files: ['shared/defaults.js', 'shared/presets.js', 'content/content.js'] }), tabId);
    await sleep(500);
    st = await iso('__leveler.status()');
    ok(st.processed === 2 && !st.reason, 'после повторного внедрения цепочки на месте, ничего не подключено второй раз', st);
    const replies = await probePage.evaluate((id) => new Promise((res) => {
      const got = [];
      chrome.runtime.onMessage.addListener((m, s) => { if (m.type === 'lv:status' && s.frameId === 0) got.push(m); });
      chrome.tabs.sendMessage(id, { type: 'lv:hello' }).catch(() => {});
      setTimeout(() => res(got.length), 500);
    }), tabId);
    await probePage.close();
    ok(replies === 1, 'отвечает только новый экземпляр', replies);

    const popup = await ctx.newPage();
    await popup.setViewportSize({ width: 320, height: 420 });
    await popup.goto(`chrome-extension://${extId}/popup/popup.html?tab=${tabId}`);
    await sleep(1600);
    const stText = await popup.textContent('#statusText');
    ok(/3/.test(stText), 'popup видит три элемента (два видео + audio во iframe)', stText);
    if (SHOTS) await popup.screenshot({ path: path.join(SHOTS, 'popup-ok.png'), fullPage: true });

    await popup.click('#chips button[data-speed="1.5"]');
    await sleep(300);
    const rate = await p.evaluate(() => {
      const v = document.getElementById('v');
      return { rate: v.playbackRate, pitch: v.preservesPitch };
    });
    const frameRate = await frame.evaluate(() => document.getElementById('a').playbackRate);
    ok(rate.rate === 1.5 && rate.pitch === true && frameRate === 1.5, 'скорость 1.5× во всех фреймах, preservesPitch', [rate, frameRate]);
    const overlay = await p.evaluate(() => [...document.documentElement.children]
      .some((n) => n.tagName === 'DIV' && n.style.zIndex === '2147483647'));
    ok(overlay, 'показан оверлей скорости');
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'overlay.png') });
    await sleep(600);   // popup сохраняет скорость сайта с задержкой
    await popup.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'lv:speed', speed: 8 }), tabId);
    await sleep(200);
    ok(await p.evaluate(() => document.getElementById('v').playbackRate) === 4, 'скорость ограничена 4×');
    await popup.click('#chips button[data-speed="1"]');
    await sleep(300);

    // ── 4а. пресеты и настройки сайта ──
    const isoF = await isolated(p, '/frame');
    st = await isoF('__leveler.status()');
    ok(st.site === 'localhost' && st.host === '127.0.0.1', 'iframe с другого домена берёт настройки сайта вкладки', st);
    await popup.selectOption('#preset', 'b:night');
    await sleep(150);
    let prm = await iso('__leveler.params');
    ok(prm.ratio === 12 && prm.threshold === -50, 'пресет «Ночной режим» применён сразу', prm);
    prm = await isoF('__leveler.params');
    ok(prm.ratio === 12, 'и во iframe', prm.ratio);
    let sync = await iso('chrome.storage.sync.get(null)');
    ok(sync['s:localhost'] && sync['s:localhost'].preset === 'b:night', 'пресет запомнен для сайта', sync['s:localhost']);

    await popup.click('#volChips button[data-volume="200"]');
    await sleep(400);
    let g = await iso(`__leveler.chains.get(document.getElementById('v')).makeup.gain.value`);
    ok(Math.abs(g - 2) < 0.05, 'усиление громкости 200%', g);
    await popup.selectOption('#preset', 'b:off');
    await sleep(150);
    prm = await iso('__leveler.params');
    ok(prm.volume === 200 && prm.ratio === 1, 'смена пресета не сбрасывает усиление, «Выкл» + 200% всё равно усиливает', prm);
    await popup.click('#volChips button[data-volume="100"]');
    await popup.selectOption('#preset', 'b:night');
    await sleep(150);
    await popup.click('#compCard summary');
    await popup.fill('#sl-ratio', '4');
    await popup.dispatchEvent('#sl-ratio', 'input');
    await sleep(150);
    prm = await iso('__leveler.params');
    ok(prm.ratio === 4 && prm.level === null && await popup.isVisible('#modified'), 'ползунок компрессора меняет звук, пресет помечен «изменён»', prm);

    await popup.click('#saveAs');
    await popup.fill('#nameInput', 'Мой фильм');
    await popup.click('#nameForm button[type=submit]');
    await sleep(300);
    sync = await iso('chrome.storage.sync.get(null)');
    const mine = (sync.presets || [])[0];
    ok(mine && mine.name === 'Мой фильм' && mine.params.ratio === 4 && sync['s:localhost'].preset === mine.id
      && await popup.inputValue('#preset') === mine.id, 'сохранить как пресет', [sync.presets, sync['s:localhost']]);
    if (SHOTS) await popup.screenshot({ path: path.join(SHOTS, 'popup-presets.png'), fullPage: true });

    await popup.click('#rename');
    await popup.fill('#nameInput', 'Кино');
    await popup.click('#nameForm button[type=submit]');
    await sleep(300);
    sync = await iso('chrome.storage.sync.get(null)');
    ok(sync.presets.length === 1 && sync.presets[0].name === 'Кино', 'переименовать', sync.presets);

    await popup.selectOption('#preset', 'b:off');
    await sleep(150);
    await popup.selectOption('#preset', mine.id);
    await sleep(150);
    prm = await iso('__leveler.params');
    ok(prm.ratio === 4, 'свой пресет выбирается из списка', prm.ratio);

    await popup.click('#remove');
    await popup.click('#confirmYes');
    await sleep(300);
    sync = await iso('chrome.storage.sync.get(null)');
    ok(sync.presets.length === 0 && await popup.inputValue('#preset') === '' && sync['s:localhost'].params.ratio === 4,
      'удалить: пресета нет, параметры сайта остались как «Свои настройки»', sync);

    // скорость запоминается для сайта и восстанавливается после перезагрузки
    await popup.click('#chips button[data-speed="1.25"]');
    await sleep(700);
    await popup.close();
    await p.reload();
    await sleep(600);
    const rateAfter = await p.evaluate(() => document.getElementById('v').playbackRate);
    ok(rateAfter === 1.25, 'скорость сайта восстановлена после перезагрузки', rateAfter);
    const iso2 = await isolated(p);
    prm = await iso2('__leveler.params');
    ok(prm.ratio === 4, 'и настройки звука сайта тоже', prm.ratio);

    // горячие клавиши и индикатор уровня
    await p.mouse.click(700, 400);
    await p.keyboard.press(']');
    await p.keyboard.press(']');
    await p.keyboard.press('[');
    await sleep(800);
    let r = await p.evaluate(() => document.getElementById('v').playbackRate);
    sync = await iso2('chrome.storage.sync.get(null)');
    ok(Math.abs(r - 1.35) < 0.001 && sync['s:localhost'].speed === 1.35 && sync['s:localhost'].params.ratio === 4,
      'клавиши ] ] [ — 1.35×, сохранено для сайта', [r, sync['s:localhost']]);
    await p.keyboard.press('Backslash');
    await sleep(100);
    ok(await p.evaluate(() => document.getElementById('v').playbackRate) === 1, 'клавиша \\ — обычная скорость');
    await p.evaluate(() => document.getElementById('v').play());
    await sleep(600);
    const lp = await ctx.newPage();
    await lp.goto(`chrome-extension://${extId}/options/options.html`);
    await lp.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'lv:levels' }), tabId);
    await sleep(200);   // анализатор «после» создаётся при первом запросе
    const lv = await lp.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'lv:levels' }), tabId);
    ok(lv && lv.pre > -60 && lv.post > -60, 'индикатор уровня получает до/после', lv);
    await lp.click('#keys input[data-key="faster"]');
    await lp.keyboard.press('KeyF');
    await sleep(300);
    await p.mouse.click(700, 400);
    await p.keyboard.press('f');
    await sleep(100);
    r = await p.evaluate(() => document.getElementById('v').playbackRate);
    ok(Math.abs(r - 1.1) < 0.001, 'своя клавиша «быстрее» (f) работает', r);
    if (SHOTS) await lp.screenshot({ path: path.join(SHOTS, 'options-keys.png'), fullPage: true });
    await lp.close();

    // другой сайт использует профиль по умолчанию
    const po = await ctx.newPage();
    await po.goto(`http://127.0.0.1:${A}/frame`);
    await sleep(400);
    const isoO = await isolated(po);
    prm = await isoO('__leveler.params');
    ok(prm.ratio === 6.5 && prm.mid === 4, 'другой сайт: профиль по умолчанию («Диалоги громче»)', prm);
    await po.close();

    // ── 4б. резервная копия ──
    const opt = await ctx.newPage();
    await opt.goto(`chrome-extension://${extId}/options/options.html`);
    await sleep(300);
    ok(await opt.locator('#sites li').count() === 1, 'страница настроек показывает сайт со своими настройками');
    const [dl] = await Promise.all([opt.waitForEvent('download'), opt.click('#export')]);
    const backup = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    ok(backup.app === 'leveler' && backup.sites.localhost && backup.sites.localhost.speed === 1.1
      && /leveler-backup-\d{4}-\d\d-\d\d\.json/.test(dl.suggestedFilename()), 'экспорт JSON', dl.suggestedFilename());
    backup.presets = [{ id: 'u:test1', name: 'Из файла', params: { ratio: 3, threshold: -20 } }, { id: 'bad', name: 'x' }];
    backup.sites = { 'Example.com': { preset: 'u:test1', speed: 9 }, '<script>': {} };
    await opt.setInputFiles('#importFile', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await sleep(400);
    sync = await opt.evaluate(() => chrome.storage.sync.get(null));
    ok(sync.presets.length === 1 && sync['s:example.com'] && sync['s:example.com'].speed === 4 && !sync['s:localhost'],
      'импорт заменяет настройки и проверяет значения', sync);
    await opt.setInputFiles('#importFile', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
    await sleep(300);
    ok(await opt.evaluate(() => document.getElementById('backupMsg').classList.contains('err')), 'чужой файл не импортируется');
    if (SHOTS) await opt.screenshot({ path: path.join(SHOTS, 'options.png'), fullPage: true });
    await opt.evaluate(() => chrome.storage.sync.clear());
    await opt.close();
    await p.close();

    // ── 4в. автозапуск без действия пользователя ──
    // Браузер не даёт запустить AudioContext: элемент не должен остаться без звука.
    const pa = await ctx.newPage();
    await pa.goto(`http://127.0.0.1:${B}/`);   // origin, где ещё не было кликов
    await sleep(300);
    await pa.evaluate(() => { const v = document.getElementById('v'); v.muted = false; return v.play().catch(() => {}); });
    await sleep(800);
    const isoA = await isolated(pa);
    st = await isoA('__leveler.status()');
    let prmA = await isoA('__leveler.params');
    ok(st.processed === 0 && st.audio === 'none' && prmA.ratio === 1, 'после установки (пресет «Выкл») звук не трогается вовсе', st);
    await isoA(`chrome.storage.sync.set({ def: { preset: 'b:dialog', speed: 1, params: LV_PRESETS.builtin('b:dialog').params } })`);
    await sleep(300);
    await pa.reload();
    await sleep(300);
    await pa.evaluate(() => { const v = document.getElementById('v'); v.muted = false; return v.play().catch(() => {}); });
    await sleep(800);
    const isoA2 = await isolated(pa);
    st = await isoA2('__leveler.status()');
    if (st.audio === 'suspended') ok(st.processed === 0, 'без действия пользователя элемент не подключается (звук оригинальный)', st);
    else console.log('  skip автозапуск: браузер сразу разрешил AudioContext', JSON.stringify(st));
    await pa.mouse.click(700, 400);
    await sleep(600);
    st = await isoA2('__leveler.status()');
    ok(st.processed >= 1 && st.audio === 'running', 'после первого клика по странице цепочка подключилась', st);
    await pa.close();

    // ── 5. чужой origin без CORS ──
    const pc = await ctx.newPage();
    await pc.goto(`http://localhost:${A}/cors`);
    await sleep(400);
    await pc.mouse.click(700, 400);
    await pc.evaluate(() => document.getElementById('v').play());
    await sleep(800);
    const isoC = await isolated(pc);
    st = await isoC('__leveler.status()');
    ok(st.reason === 'cors' && st.processed === 0 && !st.reload, 'чужой origin без CORS: не подключён, оригинальный звук', st);
    await pc.close();

    // ── 6. тишина после подключения (редирект на чужой origin) ──
    const pr = await ctx.newPage();
    await pr.goto(`http://localhost:${A}/redirect`);
    await sleep(400);
    await pr.mouse.click(700, 400);
    await pr.evaluate(() => document.getElementById('v').play());
    const isoR = await isolated(pr);
    await sleep(6500);
    st = await isoR('__leveler.status()');
    ok(st.reason === 'silent' && st.reload, 'тишина распознана, popup попросит перезагрузить страницу', st);
    const cache = await isoR('chrome.storage.local.get("unsupportedHosts")');
    ok(cache.unsupportedHosts && cache.unsupportedHosts.localhost, 'сайт запомнен в storage.local', cache);
    if (SHOTS) {
      const pp = await ctx.newPage();
      await pp.setViewportSize({ width: 320, height: 420 });
      const id = await tabIdOf(ctx, extId, isoR);
      await pp.goto(`chrome-extension://${extId}/popup/popup.html?tab=${id}`);
      await sleep(1600);
      await pp.screenshot({ path: path.join(SHOTS, 'popup-unsupported.png'), fullPage: true });
      await pp.close();
    }
    await pr.reload();
    await sleep(400);
    await pr.mouse.click(700, 400);
    await pr.evaluate(() => document.getElementById('v').play());
    await sleep(600);
    const isoR2 = await isolated(pr);
    st = await isoR2('__leveler.status()');
    ok(st.reason === 'cached' && st.processed === 0, 'после перезагрузки сайт не трогается, звук оригинальный', st);
    await isoR2('chrome.storage.local.remove("unsupportedHosts")');

    // ── 7. AudioFocus: звук в активной вкладке ставит фоновые на паузу или приглушает ──
    const fa = await ctx.newPage();
    await fa.goto(`http://localhost:${A}/`);
    const fb = await ctx.newPage();
    await fb.goto(`http://127.0.0.1:${B}/`);
    const fc = await ctx.newPage();
    await fc.goto(`http://127.0.0.1:${A}/frame`);
    await sleep(500);
    const isoFa = await isolated(fa), isoFb = await isolated(fb), isoFc = await isolated(fc);
    await isoFa('chrome.storage.sync.set({ focusMode: "pause" })');
    await sleep(300);
    const playIn = async (pg, sel) => {
      await pg.bringToFront();
      await pg.mouse.click(700, 400);
      await pg.evaluate((s) => { const m = document.querySelector(s); m.loop = true; return m.play(); }, sel);
    };
    const vState = (pg, sel) => pg.evaluate((s) => { const m = document.querySelector(s); return { paused: m.paused, volume: m.volume }; }, sel);
    const focusGain = (iso) => iso('(() => { const c = __leveler.chains.get(document.getElementById("v")); return c ? Math.round(c.focus.gain.value * 100) / 100 : null; })()');

    await playIn(fa, '#v');
    await sleep(600);
    await playIn(fb, '#v');
    await sleep(800);
    ok((await vState(fa, '#v')).paused && await isoFa('__leveler.held') === 'pause', 'пауза: фоновая вкладка остановилась', await vState(fa, '#v'));
    ok(!(await vState(fb, '#v')).paused, 'пауза: активная вкладка играет');
    await fb.evaluate(() => document.getElementById('v').pause());
    await sleep(600);
    ok((await vState(fa, '#v')).paused, 'короткая пауза в активной вкладке фоновую не будит');
    await sleep(1600);
    ok(!(await vState(fa, '#v')).paused && await isoFa('__leveler.held') === null, 'активная замолчала: фоновая продолжила', await vState(fa, '#v'));

    await isoFa('chrome.storage.sync.set({ focusMode: "duck", enabled: false })');
    await sleep(300);
    await playIn(fc, '#a');     // обработка выключена: элемент не подключён к Web Audio, приглушение через volume
    await sleep(500);
    await playIn(fb, '#v');
    await sleep(1200);
    let ga = await focusGain(isoFa);
    let vc = await vState(fc, '#a');
    ok(ga === 0.2 && !(await vState(fa, '#v')).paused, 'приглушение: фоновая вкладка тише (GainNode), но играет', ga);
    ok(Math.abs(vc.volume - 0.2) < 0.01 && !vc.paused && await isoFc('__leveler.status().processed') === 0, 'приглушение без Web Audio: через volume', vc);
    await isoFa('chrome.storage.sync.set({ focusDuck: 0.5 })');
    await sleep(800);
    ok(await focusGain(isoFa) === 0.5, 'смена громкости фоновых вкладок применяется сразу', await focusGain(isoFa));
    await fb.evaluate(() => document.getElementById('v').pause());
    await sleep(2400);
    ga = await focusGain(isoFa);
    vc = await vState(fc, '#a');
    ok(ga === 1 && Math.abs(vc.volume - 1) < 0.01, 'активная замолчала: громкость вернулась', [ga, vc]);

    await playIn(fb, '#v');
    await sleep(1000);
    await fb.close();
    await sleep(2400);
    ok(await focusGain(isoFa) === 1, 'закрыли активную вкладку: громкость вернулась', await focusGain(isoFa));
    await isoFa('chrome.storage.sync.set({ focusMode: "off", focusDuck: 0.2, enabled: true })');
    await sleep(300);
    await isoFa('chrome.storage.sync.set({ focusMode: "pause" })');
    await sleep(300);
    await isoFa('chrome.storage.sync.set({ focusMode: "off" })');
    await sleep(300);
    await playIn(fa, '#v');
    await sleep(800);
    ok(!(await vState(fc, '#a')).paused && !(await vState(fa, '#v')).paused, 'выключено: вкладки не трогаются');
    await fa.close(); await fc.close();
  } catch (e) {
    console.error(e);
    failed++;
  } finally {
    await ctx.close();
    sa.close(); sb.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(failed ? `\n${failed} проверок не прошло` : '\nвсе проверки прошли');
  process.exit(failed ? 1 : 0);
})();
