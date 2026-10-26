// Скриншоты для магазинов (1280×800) и README на трёх языках.
//
//   node store/tests/shots.js
//
// Снимает настоящий popup и страницу настроек расширения в Chromium с нужным языком
// интерфейса и собирает из них кадры: store/screenshots/<lang>/*.png, docs/img/*-<lang>.png,
// store/promo/tile_440x280.png.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const EXT = path.join(ROOT, 'extension');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'leveler-shots-'));
const WAV = path.join(tmp, 't.wav');
execFileSync('python3', [path.join(__dirname, 'make_wav.py'), WAV]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const T = {
  en: {
    locale: 'en-US',
    s1: ['Even out the loudness of any movie', 'Quiet dialogue louder, explosions softer. Presets for night, headphones and bass.'],
    s2: ['Compressor and equalizer', 'One “Level the sound” slider or full control, with a before / after level meter.'],
    s3: ['Speed 0.25–4× and volume boost', 'Without the chipmunk voice. Hotkeys [ ] \\ and up to 400 % volume.'],
    s4: ['Remembered for every site', 'Your own presets, per-site preset and speed, hotkeys, backup to a file.'],
    sub: 'Did you hear that?', tile: 'Even out movie loudness', site: 'movies.example'
  },
  ru: {
    locale: 'ru-RU',
    s1: ['Ровная громкость любого фильма', 'Тихие диалоги громче, взрывы тише. Пресеты для ночи, наушников и баса.'],
    s2: ['Компрессор и эквалайзер', 'Один ползунок «Выровнять звук» или полная настройка, индикатор уровня до и после.'],
    s3: ['Скорость 0.25–4× и усиление громкости', 'Без «мультяшного» голоса. Горячие клавиши [ ] \\ и громкость до 400 %.'],
    s4: ['Запоминается для каждого сайта', 'Свои пресеты, пресет и скорость по сайтам, горячие клавиши, резервная копия.'],
    sub: 'Ты это слышал?', tile: 'Ровная громкость фильмов', site: 'kino.example'
  },
  uk: {
    locale: 'uk-UA',
    s1: ['Рівна гучність будь-якого фільму', 'Тихі діалоги гучніші, вибухи тихіші. Пресети для ночі, навушників і басу.'],
    s2: ['Компресор і еквалайзер', 'Один повзунок «Вирівняти звук» або повне налаштування, індикатор рівня до і після.'],
    s3: ['Швидкість 0.25–4× і підсилення гучності', 'Без «мультяшного» голосу. Гарячі клавіші [ ] \\ і гучність до 400 %.'],
    s4: ['Запам’ятовується для кожного сайту', 'Власні пресети, пресет і швидкість для сайтів, гарячі клавіші, резервна копія.'],
    sub: 'Ти це чув?', tile: 'Рівна гучність фільмів', site: 'kino.example'
  }
};

const PORT = 8731;
const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">
<video id="v" src="/t.wav" loop style="position:fixed;left:0;top:0;width:10px;height:10px;opacity:0"></video>
<div id="big" style="position:fixed;inset:0"></div>`;
const server = http.createServer((req, res) => {
  if (req.url === '/t.wav') { res.writeHead(200, { 'Content-Type': 'audio/wav' }); return res.end(fs.readFileSync(WAV)); }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE);
}).listen(PORT);

const b64 = (file) => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
const logo = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(EXT, 'icons/logo.svg')).toString('base64');

// «Кадр из фильма» без чужих картинок: ночной город из градиентов.
const scene = (sub, speed) => `
<div class="scene">
  <div class="sky"></div><div class="moon"></div>
  <div class="city">${Array.from({ length: 18 }, (_, i) => `<i style="left:${i * 5.6}%;height:${22 + ((i * 37) % 45)}%;width:${3 + (i % 3)}%"></i>`).join('')}</div>
  <div class="glow"></div>
  <div class="sub">${sub}</div>
  ${speed ? `<div class="speed">${speed}</div>` : ''}
  <div class="bar"><span></span></div>
</div>`;

const STYLE = `
* { box-sizing: border-box; margin: 0; }
body { width: 1280px; height: 800px; overflow: hidden; font-family: Inter, "Segoe UI", system-ui, sans-serif;
  background: radial-gradient(1200px 700px at 85% 20%, #12382a 0%, #0b0d10 55%) #0b0d10; color: #eef1f4; }
.top { position: absolute; left: 72px; top: 64px; width: 600px; }
.brand { display: flex; align-items: center; gap: 12px; font-size: 20px; font-weight: 600; color: #9fe8c6; margin-bottom: 26px; }
.brand img { width: 40px; height: 40px; }
h1 { font-size: 46px; line-height: 1.12; letter-spacing: -.02em; font-weight: 700; margin-bottom: 18px; }
p { font-size: 21px; line-height: 1.45; color: #a9b2bc; }
.scene { position: absolute; left: 72px; top: 350px; width: 640px; height: 360px; border-radius: 18px; overflow: hidden;
  box-shadow: 0 30px 80px rgba(0,0,0,.55); background: #05070c; }
.sky { position: absolute; inset: 0; background: linear-gradient(180deg, #0d1b3a 0%, #24315e 45%, #c46a4a 78%, #2a1a24 100%); }
.moon { position: absolute; right: 90px; top: 50px; width: 54px; height: 54px; border-radius: 50%; background: #f6e7c8; box-shadow: 0 0 60px 20px rgba(246,231,200,.25); }
.city { position: absolute; left: 0; right: 0; bottom: 0; height: 60%; }
.city i { position: absolute; bottom: 0; background: #0a0d16; border-top: 2px solid #1b2238;
  background-image: repeating-linear-gradient(180deg, transparent 0 10px, rgba(255,214,140,.22) 10px 13px); }
.glow { position: absolute; inset: 0; background: radial-gradient(400px 160px at 30% 100%, rgba(255,140,80,.35), transparent); }
.sub { position: absolute; left: 0; right: 0; bottom: 46px; text-align: center; font-size: 24px; font-weight: 600;
  text-shadow: 0 2px 6px #000, 0 0 2px #000; }
.speed { position: absolute; left: 22px; top: 22px; font-size: 26px; font-weight: 600; background: rgba(0,0,0,.62); padding: 10px 16px; border-radius: 10px; }
.bar { position: absolute; left: 20px; right: 20px; bottom: 18px; height: 4px; background: rgba(255,255,255,.25); border-radius: 2px; }
.bar span { display: block; width: 38%; height: 100%; background: #3ddc97; border-radius: 2px; }
.popup { position: absolute; right: 72px; top: 56px; width: 360px; height: 688px; border-radius: 16px; overflow: hidden;
  box-shadow: 0 30px 90px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.06); background: #0b0d10; }
.popup img { width: 360px; display: block; }
.wide { position: absolute; left: 72px; top: 330px; width: 1136px; height: 410px; border-radius: 18px; overflow: hidden;
  box-shadow: 0 30px 90px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.06); }
.wide img { width: 1136px; display: block; }
.keys { position: absolute; left: 72px; top: 730px; display: flex; gap: 10px; }
.keys b { min-width: 44px; height: 40px; padding: 0 12px; display: grid; place-items: center; border-radius: 9px;
  background: #1a1f25; border: 1px solid #2c333b; border-bottom-width: 3px; font-size: 18px; }
`;

function frame({ title, text, popup, offset = 0, sceneHtml = '', wide = null, keys = false }) {
  return `<!doctype html><meta charset="utf-8"><style>${STYLE}</style>
  <div class="top"><div class="brand"><img src="${logo}">Leveler</div><h1>${title}</h1><p>${text}</p></div>
  ${keys ? '<div class="keys"><b>[</b><b>]</b><b>\\</b></div>' : ''}
  ${sceneHtml}
  ${popup ? `<div class="popup"><img src="${popup}" style="margin-top:${-offset}px"></div>` : ''}
  ${wide ? `<div class="wide"><img src="${wide}"></div>` : ''}`;
}

(async () => {
  for (const lang of Object.keys(T)) {
    const L = T[lang];
    const ctx = await chromium.launchPersistentContext(path.join(tmp, 'p-' + lang), {
      channel: 'chromium', headless: true, locale: L.locale, colorScheme: 'dark', deviceScaleFactor: 2,
      env: Object.assign({}, process.env, { LANGUAGE: lang, LANG: L.locale.replace('-', '_') + '.UTF-8' }),
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--lang=${L.locale}`,
        `--host-resolver-rules=MAP ${L.site} 127.0.0.1`]
    });
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
    const extId = sw.url().split('/')[2];
    const p = ctx.pages()[0] || await ctx.newPage();
    await p.goto(`http://${L.site}:${PORT}/`);
    const ext = await ctx.newPage();
    await ext.goto(`chrome-extension://${extId}/options/options.html`);
    const ownName = { en: '🎬 Movie night', ru: '🎬 Кино вечером', uk: '🎬 Кіно ввечері' }[lang];
    await ext.evaluate(([ownName, site]) => {
      const PR = self.LV_PRESETS;
      const own = { id: 'u:film', name: ownName, params: PR.withLevel(PR.builtin('b:dialog').params, 70) };
      return chrome.storage.sync.set({
        presets: [own],
        def: { preset: 'b:dialog', speed: 1, params: PR.builtin('b:dialog').params },
        ['s:' + site]: { preset: 'b:dialog', speed: 1.25, params: Object.assign({}, PR.builtin('b:dialog').params, { volume: 150 }) },
        's:youtube.com': { preset: 'b:night', speed: 1.5, params: PR.builtin('b:night').params },
        's:twitch.tv': { preset: 'b:headphones', speed: 1, params: PR.builtin('b:headphones').params },
        's:vimeo.com': { preset: 'u:film', speed: 1, params: own.params }
      });
    }, [ownName, L.site]);
    await p.reload();
    await sleep(400);
    await p.mouse.click(400, 300);
    await p.evaluate(() => document.getElementById('v').play());
    await sleep(800);
    // id вкладки: страница расширения видит sender.tab в ответе content script
    const got = ext.evaluate(() => new Promise((r) => chrome.runtime.onMessage.addListener((m, s) => { if (m.type === 'lv:status' && s.tab) r(s.tab.id); })));
    const ids = await ext.evaluate(() => chrome.tabs.query({}).then((t) => t.map((x) => x.id)));
    for (const id of ids) await ext.evaluate((i) => chrome.tabs.sendMessage(i, { type: 'lv:hello' }).catch(() => {}), id);
    const tabId = await got;

    const pop = await ctx.newPage();
    await pop.setViewportSize({ width: 320, height: 600 });
    const shots = {};
    const shotPopup = async (name, prep) => {
      await pop.goto(`chrome-extension://${extId}/popup/popup.html?tab=${tabId}`);
      await sleep(1600);
      if (prep) await prep();
      await sleep(700);
      shots[name] = path.join(tmp, `${lang}-${name}.png`);
      await pop.screenshot({ path: shots[name], fullPage: true });
    };
    await shotPopup('main');
    await shotPopup('comp', async () => {
      await pop.click('#compCard summary');
      await pop.click('#eqCard summary');
    });
    await ext.setViewportSize({ width: 1136, height: 820 });
    await ext.reload();
    await sleep(500);
    // для кадра — две колонки, чтобы было видно и пресеты, и сайты
    await ext.addStyleTag({ content: 'main{max-width:1100px;columns:2;column-gap:16px;padding-top:24px} .card{break-inside:avoid} header{column-span:all}' });
    await sleep(200);
    shots.options = path.join(tmp, `${lang}-options.png`);
    await ext.screenshot({ path: shots.options });
    await ctx.close();

    // сборка кадров
    const b = await chromium.launch({ channel: 'chromium', headless: true });
    const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
    const out = path.join(ROOT, 'store/screenshots', lang);
    fs.mkdirSync(out, { recursive: true });
    const frames = [
      ['1_presets', frame({ title: L.s1[0], text: L.s1[1], popup: b64(shots.main), sceneHtml: scene(L.sub) })],
      ['2_compressor', frame({ title: L.s2[0], text: L.s2[1], popup: b64(shots.comp), offset: 330, sceneHtml: scene(L.sub) })],
      ['3_speed', frame({ title: L.s3[0], text: L.s3[1], popup: b64(shots.main), sceneHtml: scene(L.sub, '1.25×'), keys: true })],
      ['4_settings', frame({ title: L.s4[0], text: L.s4[1], wide: b64(shots.options) })]
    ];
    for (const [name, html] of frames) {
      await page.setContent(html);
      await sleep(100);
      await page.screenshot({ path: path.join(out, name + '.png') });
    }
    // для README: popup отдельно
    fs.copyFileSync(path.join(out, '1_presets.png'), path.join(ROOT, `docs/img/presets-${lang}.png`));
    fs.copyFileSync(path.join(out, '2_compressor.png'), path.join(ROOT, `docs/img/compressor-${lang}.png`));
    fs.copyFileSync(path.join(out, '3_speed.png'), path.join(ROOT, `docs/img/speed-${lang}.png`));
    if (lang === 'en') {
      const tile = await b.newPage({ viewport: { width: 440, height: 280 } });
      await tile.setContent(`<!doctype html><meta charset="utf-8"><style>
        body{margin:0;width:440px;height:280px;display:grid;place-items:center;font-family:Inter,"Segoe UI",system-ui,sans-serif;
        background:radial-gradient(400px 260px at 80% 10%,#12382a,#0b0d10 70%) #0b0d10;color:#eef1f4;text-align:center}
        img{width:84px;height:84px} h1{font-size:34px;margin:12px 0 4px} p{margin:0;color:#9fe8c6;font-size:17px}</style>
        <div><img src="${logo}"><h1>Leveler</h1><p>${L.tile}</p></div>`);
      fs.mkdirSync(path.join(ROOT, 'store/promo'), { recursive: true });
      await tile.screenshot({ path: path.join(ROOT, 'store/promo/tile_440x280.png') });
    }
    await b.close();
    console.log('готово:', lang);
  }
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
