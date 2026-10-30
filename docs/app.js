// Ссылки на магазины. Пустая ссылка — расширения ещё нет в магазине, кнопка ведёт к #install.
const STORES = {
  chrome: 'https://chromewebstore.google.com/detail/phbjpipnbhffcegccfbbfabbhmgaelko',
  firefox: ''
};

// Кошельки (Trust Wallet). QR-коды лежат в qr/<id>.svg.
const WALLETS = [
  { id: 'usdt-trc20', name: 'USDT', net: 'TRON · TRC-20', color: '#26a17b', sign: '₮', addr: 'TWW4iFFTPtvDBu3NH2iy6WFKQZgkq3TRhN' },
  { id: 'btc', name: 'Bitcoin', net: 'BTC', color: '#f7931a', sign: '₿', addr: 'bc1qk2eu8d53x08p0m6k3z5ernv55v2clr4ywarp7w' },
  { id: 'eth', name: 'Ethereum', net: 'ETH · ERC-20', color: '#627eea', sign: 'Ξ', addr: '0x3D0765a406dD7AEDF9614bB3742A9084dfF42f18' },
  { id: 'sol', name: 'Solana', net: 'SOL', color: '#9945ff', sign: 'S', addr: 'G1iMvFiS6yzTouDnZcaFHimkdicNmTtuxhYjZW1UTpPE' }
];

// Куда шлются сообщения с формы обратной связи (FormSubmit.co: почта или выданный им адрес-псевдоним).
// Пусто — форма скрыта.
const FEEDBACK_TO = '5b15bb3081e4f8971c3f368b305ab261';

const T = {
  ru: {
    title: 'Leveler — ровная громкость в любом видео',
    fb_title: 'Есть идея или нашли ошибку?', fb_sub: 'Расскажите, чего не хватает. Лучшие идеи попадут в следующие версии.', fb_btn: 'Написать',
    nav_features: 'Возможности', nav_install: 'Установить', nav_donate: 'Поддержать', nav_support: 'Обратная связь',
    hero_title: 'Тихие диалоги громче, взрывы тише',
    hero_lead: 'Leveler выравнивает громкость фильмов и сериалов прямо в браузере. Больше не нужно хвататься за звук на каждой сцене.',
    btn_chrome: 'Добавить в Chrome', btn_firefox: 'Добавить в Firefox',
    hero_free: 'Бесплатно, без аккаунтов и рекламы. YouTube, Twitch, онлайн-кинотеатры и любые сайты с HTML5-видео.',
    demo_before: 'Без Leveler', demo_before_d: 'шёпот не слышно, взрыв оглушает',
    demo_after: 'С Leveler', demo_after_d: 'всё на одной громкости',
    demo_talk: 'диалоги', demo_boom: 'взрывы и музыка',
    f_title: 'Что умеет', f_sub: 'Один ползунок «Выровнять звук» для всех и подробные настройки для тех, кто любит покрутить.',
    m1_t: 'Компрессор', m1_d: 'Сжимает громкие места и подтягивает тихие. Порог, степень, мягкость, атака и восстановление.',
    m2_t: 'Пресеты', m2_d: '«Ночной режим», «Диалоги громче», «Подкасты», «Наушники», «Бас+», «Музыка» и свои пресеты с экспортом в JSON.',
    m3_t: 'Эквалайзер', m3_d: 'Три полосы (низ, середина, верх) и срез гула на низких частотах.',
    m4_t: 'Скорость', m4_d: 'От 0,25× до 4× без «бурундучьего» голоса, с подсказкой на видео.',
    m5_t: 'Для каждого сайта', m5_d: 'Пресет и скорость запоминаются отдельно для каждого сайта.',
    m6_t: 'Горячие клавиши', m6_d: '[ и ] меняют скорость, \\ сбрасывает её. Клавиши можно переназначить.',
    h_title: 'Как это работает', h_sub: 'Три шага, и звук в фильмах перестаёт прыгать.',
    h1_t: 'Установите расширение', h1_d: 'Из Chrome Web Store или Firefox Add-ons. Аккаунт не нужен.',
    h2_t: 'Включите видео', h2_d: 'Leveler сам находит видео и аудио на странице, в том числе в iframe и в полноэкранном режиме.',
    h3_t: 'Выберите пресет', h3_d: 'Или подвиньте ползунок «Выровнять звук». Сайт запомнит ваш выбор.',
    i_title: 'Установить', i_sub: 'Расширение одинаково работает в Chrome, Edge, Opera, Brave и Firefox.',
    i_chrome: 'Chrome, Edge, Opera, Brave, Яндекс Браузер', i_firefox: 'Firefox для компьютера',
    i_manual: 'Версия для Firefox ещё проходит проверку, пока её можно установить вручную: скачайте zip из',
    q_title: 'Частые вопросы',
    q1: 'Почему на Netflix и похожих сервисах звук не обрабатывается?', a1: 'Там видео защищено (DRM), и браузер отдаёт расширениям вместо звука тишину. Leveler это распознаёт, оставляет оригинальный звук и пишет в окне расширения: «Этот сайт не поддерживает обработку звука». Скорость при этом работает.',
    q2: 'Это не испортит звук?', a2: 'Нет. Параметры меняются плавно, без щелчков, а на выходе стоит ограничитель, который не даёт звуку перегружаться. Выключатель в окне расширения мгновенно возвращает оригинал.',
    q3: 'Чем это лучше ночного режима в телевизоре?', a3: 'По сути это он и есть, только для браузера и с настройками: можно выбрать готовый пресет или настроить компрессор и эквалайзер под свои колонки или наушники.',
    q4: 'Расширение грузит процессор?', a4: 'Почти нет. Обработка идёт встроенным в браузер Web Audio, а индикаторы уровня рисуются только пока окно расширения открыто.',
    q5: 'Что значит «доступ ко всем сайтам»?', a5: 'Он нужен, чтобы найти на странице видео и подключить к нему обработку звука. Ничего не читается и никуда не отправляется, всё происходит на вашем устройстве.',
    q6: 'Как перенести настройки на другой компьютер?', a6: 'Пресеты и настройки сайтов синхронизируются через ваш аккаунт браузера. Ещё их можно сохранить в JSON-файл и загрузить обратно.',
    d_title: 'Поддержать проект',
    d_sub: 'Leveler бесплатен и без рекламы. Если он вам нравится, можно поддержать разработку криптовалютой. Любая сумма помогает выпускать новые версии.',
    d_warn: 'Отправляйте монеты только в той сети, что указана на карточке. Перевод в другой сети может потеряться.',
    d_thanks: 'Спасибо, что вы с нами.',
    copy: 'Скопировать адрес', copied: 'Скопировано',
    vg_title: 'Ещё от автора', more_sub: 'Leveler делает один разработчик. Вот ещё четыре бесплатных проекта: для видео в браузере, для скриншотов и для домашнего сервера.', more_site: 'Сайт', more_dl: 'Скачать',
    vg_kind: 'Расширение для Chrome, Edge и Firefox', vg_desc: 'Мягкая подсветка в цвет картинки вокруг любого видео, как лента за телевизором. Работает на YouTube, Twitch и любом другом сайте, и в полноэкранном режиме.',
    vg_c1: 'Размытие или LED-лента', vg_c2: 'Цвет комнаты', vg_c3: 'Полный экран', vg_c4: 'Пресеты',
    sn_kind: 'Программа для Windows, macOS и Linux', sn_desc: 'Быстрая и лёгкая программа для скриншотов с открытым кодом: нажмите PrtSc, выделите область, добавьте стрелку или подпись и скопируйте. Без аккаунтов и облака.',
    sn_c1: 'Одна клавиша PrtSc', sn_c2: 'Пометки', sn_c3: 'Без облака', sn_c4: 'Несколько мегабайт', sn_url: 'https://vkardin.github.io/snapt/ru/', sn_dl: 'https://vkardin.github.io/snapt/ru/#download',
    fl_kind: 'Расширение для Chrome, Edge и Firefox', fl_desc: 'Выносит любое веб-видео в плавающее окно поверх всех окон вместе с субтитрами сайта и помнит секунду, где вы остановились. Закладки с заметками и экспорт в Markdown.',
    fl_c1: 'Плавающее окно', fl_c2: 'Субтитры с собой', fl_c3: 'Продолжить с 12:34', fl_c4: 'Заметки в Markdown',
    uni_kind: 'Telegram-бот для домашнего сервера', uni_desc: 'Ваш домашний сервер в Telegram: приложения одной сеткой, мониторинг, сводка новостей и ремонт сервера в чате и в мини-приложении. Ставится одной командой.',
    uni_c1: 'Мини-приложение', uni_c2: 'Мониторинг', uni_c3: 'Сводка новостей', uni_c4: 'Self-hosted',
    privacy: 'Конфиденциальность'
  },
  uk: {
    title: 'Leveler — рівна гучність у будь-якому відео',
    fb_title: 'Маєте ідею чи знайшли помилку?', fb_sub: 'Розкажіть, чого бракує. Найкращі ідеї потраплять у наступні версії.', fb_btn: 'Написати',
    nav_features: 'Можливості', nav_install: 'Встановити', nav_donate: 'Підтримати', nav_support: 'Зворотний зв’язок',
    hero_title: 'Тихі діалоги гучніше, вибухи тихіше',
    hero_lead: 'Leveler вирівнює гучність фільмів і серіалів просто в браузері. Більше не треба хапатися за звук на кожній сцені.',
    btn_chrome: 'Додати до Chrome', btn_firefox: 'Додати до Firefox',
    hero_free: 'Безкоштовно, без акаунтів і реклами. YouTube, Twitch, онлайн-кінотеатри та будь-які сайти з HTML5-відео.',
    demo_before: 'Без Leveler', demo_before_d: 'шепіт не чути, вибух оглушує',
    demo_after: 'З Leveler', demo_after_d: 'усе на одній гучності',
    demo_talk: 'діалоги', demo_boom: 'вибухи й музика',
    f_title: 'Що вміє', f_sub: 'Один повзунок «Вирівняти звук» для всіх і докладні налаштування для тих, хто любить покрутити.',
    m1_t: 'Компресор', m1_d: 'Стискає гучні місця й підтягує тихі. Поріг, ступінь, м’якість, атака й відновлення.',
    m2_t: 'Пресети', m2_d: '«Нічний режим», «Діалоги гучніше», «Подкасти», «Навушники», «Бас+», «Музика» і власні пресети з експортом у JSON.',
    m3_t: 'Еквалайзер', m3_d: 'Три смуги (низ, середина, верх) і зріз гулу на низьких частотах.',
    m4_t: 'Швидкість', m4_d: 'Від 0,25× до 4× без «бурундучого» голосу, з підказкою на відео.',
    m5_t: 'Для кожного сайту', m5_d: 'Пресет і швидкість запам’ятовуються окремо для кожного сайту.',
    m6_t: 'Гарячі клавіші', m6_d: '[ і ] змінюють швидкість, \\ скидає її. Клавіші можна перепризначити.',
    h_title: 'Як це працює', h_sub: 'Три кроки, і звук у фільмах перестає стрибати.',
    h1_t: 'Встановіть розширення', h1_d: 'З Chrome Web Store або Firefox Add-ons. Акаунт не потрібен.',
    h2_t: 'Увімкніть відео', h2_d: 'Leveler сам знаходить відео й аудіо на сторінці, зокрема в iframe і в повноекранному режимі.',
    h3_t: 'Виберіть пресет', h3_d: 'Або посуньте повзунок «Вирівняти звук». Сайт запам’ятає ваш вибір.',
    i_title: 'Встановити', i_sub: 'Розширення однаково працює в Chrome, Edge, Opera, Brave і Firefox.',
    i_chrome: 'Chrome, Edge, Opera, Brave', i_firefox: 'Firefox для комп’ютера',
    i_manual: 'Версія для Firefox ще проходить перевірку, поки її можна встановити вручну: завантажте zip із',
    q_title: 'Часті питання',
    q1: 'Чому на Netflix і схожих сервісах звук не обробляється?', a1: 'Там відео захищене (DRM), і браузер віддає розширенням замість звуку тишу. Leveler це розпізнає, залишає оригінальний звук і пише у вікні розширення: «Цей сайт не підтримує обробку звуку». Швидкість при цьому працює.',
    q2: 'Це не зіпсує звук?', a2: 'Ні. Параметри змінюються плавно, без клацань, а на виході стоїть обмежувач, який не дає звуку перевантажуватися. Вимикач у вікні розширення миттєво повертає оригінал.',
    q3: 'Чим це краще за нічний режим у телевізорі?', a3: 'По суті це він і є, лише для браузера й з налаштуваннями: можна вибрати готовий пресет або налаштувати компресор і еквалайзер під свої колонки чи навушники.',
    q4: 'Розширення навантажує процесор?', a4: 'Майже ні. Обробка йде вбудованим у браузер Web Audio, а індикатори рівня малюються лише поки вікно розширення відкрите.',
    q5: 'Що означає «доступ до всіх сайтів»?', a5: 'Він потрібен, щоб знайти на сторінці відео й підключити до нього обробку звуку. Нічого не читається й нікуди не надсилається, усе відбувається на вашому пристрої.',
    q6: 'Як перенести налаштування на інший комп’ютер?', a6: 'Пресети й налаштування сайтів синхронізуються через ваш акаунт браузера. Ще їх можна зберегти в JSON-файл і завантажити назад.',
    d_title: 'Підтримати проєкт',
    d_sub: 'Leveler безкоштовний і без реклами. Якщо він вам подобається, можна підтримати розробку криптовалютою. Будь-яка сума допомагає випускати нові версії.',
    d_warn: 'Надсилайте монети лише в тій мережі, що вказана на картці. Переказ в іншій мережі може загубитися.',
    d_thanks: 'Дякуємо, що ви з нами.',
    copy: 'Скопіювати адресу', copied: 'Скопійовано',
    vg_title: 'Ще від автора', more_sub: 'Leveler робить один розробник. Ось ще чотири безкоштовні проєкти: для відео в браузері, для скриншотів і для домашнього сервера.', more_site: 'Сайт', more_dl: 'Завантажити',
    vg_kind: 'Розширення для Chrome, Edge і Firefox', vg_desc: 'М’яка підсвітка в колір картинки навколо будь-якого відео, як стрічка за телевізором. Працює на YouTube, Twitch і будь-якому іншому сайті, і в повноекранному режимі.',
    vg_c1: 'Розмиття або LED-стрічка', vg_c2: 'Колір кімнати', vg_c3: 'Повний екран', vg_c4: 'Пресети',
    sn_kind: 'Програма для Windows, macOS і Linux', sn_desc: 'Швидка й легка програма для скриншотів з відкритим кодом: натисніть PrtSc, виділіть область, додайте стрілку чи підпис і скопіюйте. Без акаунтів і хмари.',
    sn_c1: 'Одна клавіша PrtSc', sn_c2: 'Позначки', sn_c3: 'Без хмари', sn_c4: 'Кілька мегабайт', sn_url: 'https://vkardin.github.io/snapt/uk/', sn_dl: 'https://vkardin.github.io/snapt/uk/#download',
    fl_kind: 'Розширення для Chrome, Edge і Firefox', fl_desc: 'Виносить будь-яке веб-відео в плаваюче вікно поверх усіх вікон разом із субтитрами сайту й пам’ятає секунду, де ви зупинилися. Закладки з нотатками та експорт у Markdown.',
    fl_c1: 'Плаваюче вікно', fl_c2: 'Субтитри з собою', fl_c3: 'Продовжити з 12:34', fl_c4: 'Нотатки в Markdown',
    uni_kind: 'Telegram-бот для домашнього сервера', uni_desc: 'Ваш домашній сервер у Telegram: застосунки однією сіткою, моніторинг, зведення новин і ремонт сервера в чаті та міні-застосунку. Встановлюється однією командою. Інтерфейс російською.',
    uni_c1: 'Міні-застосунок', uni_c2: 'Моніторинг', uni_c3: 'Зведення новин', uni_c4: 'Self-hosted',
    privacy: 'Конфіденційність'
  },
  en: {
    title: 'Leveler — even loudness for any video',
    fb_title: 'Have an idea or found a bug?', fb_sub: 'Tell me what’s missing. The best ideas go into the next versions.', fb_btn: 'Write to us',
    nav_features: 'Features', nav_install: 'Install', nav_donate: 'Donate', nav_support: 'Feedback',
    hero_title: 'Quiet dialogue louder, explosions softer',
    hero_lead: 'Leveler evens out the loudness of movies and shows right in your browser. No more reaching for the volume every scene.',
    btn_chrome: 'Add to Chrome', btn_firefox: 'Add to Firefox',
    hero_free: 'Free, no accounts, no ads. YouTube, Twitch, streaming sites and any page with HTML5 video.',
    demo_before: 'Without Leveler', demo_before_d: 'whispers lost, blasts deafening',
    demo_after: 'With Leveler', demo_after_d: 'everything at one level',
    demo_talk: 'dialogue', demo_boom: 'explosions and music',
    f_title: 'What it does', f_sub: 'One “Level the sound” slider for everyone, and detailed controls for those who like to tweak.',
    m1_t: 'Compressor', m1_d: 'Tames loud parts and lifts quiet ones. Threshold, ratio, knee, attack and release.',
    m2_t: 'Presets', m2_d: 'Night mode, Louder dialogue, Podcasts, Headphones, Bass+, Music and your own presets with JSON export.',
    m3_t: 'Equalizer', m3_d: 'Three bands (low, mid, high) and a low cut for rumble.',
    m4_t: 'Speed', m4_d: 'From 0.25× to 4× without the chipmunk voice, with an overlay on the video.',
    m5_t: 'Per-site settings', m5_d: 'Preset and speed are remembered separately for each site.',
    m6_t: 'Hotkeys', m6_d: '[ and ] change the speed, \\ resets it. Keys can be reassigned.',
    h_title: 'How it works', h_sub: 'Three steps, and movie sound stops jumping around.',
    h1_t: 'Install the extension', h1_d: 'From the Chrome Web Store or Firefox Add-ons. No account needed.',
    h2_t: 'Play a video', h2_d: 'Leveler finds video and audio on the page by itself, including iframes and fullscreen.',
    h3_t: 'Pick a preset', h3_d: 'Or move the “Level the sound” slider. The site remembers your choice.',
    i_title: 'Install', i_sub: 'Works the same in Chrome, Edge, Opera, Brave and Firefox.',
    i_chrome: 'Chrome, Edge, Opera, Brave', i_firefox: 'Firefox for desktop',
    i_manual: 'The Firefox version is still in review; meanwhile you can install it manually: download the zip from',
    q_title: 'FAQ',
    q1: 'Why is sound not processed on Netflix and similar services?', a1: 'Their video is protected (DRM), and the browser gives extensions silence instead of sound. Leveler detects this, keeps the original sound and says “This site does not support audio processing” in the popup. Speed control still works.',
    q2: 'Will it ruin the sound?', a2: 'No. Settings change smoothly without clicks, and a limiter at the output keeps the sound from clipping. The switch in the popup brings back the original instantly.',
    q3: 'How is it better than the night mode on my TV?', a3: 'It is basically the same idea, for the browser and with controls: pick a ready preset or tune the compressor and equalizer for your speakers or headphones.',
    q4: 'Does it use a lot of CPU?', a4: 'Hardly any. Processing runs on the browser’s built-in Web Audio, and the level meters are drawn only while the popup is open.',
    q5: 'Why does it need access to all sites?', a5: 'To find videos on the page and connect audio processing to them. Nothing is read or sent anywhere; everything happens on your device.',
    q6: 'How do I move my settings to another computer?', a6: 'Presets and site settings sync through your browser account. You can also save them to a JSON file and load it back.',
    d_title: 'Support the project',
    d_sub: 'Leveler is free and has no ads. If you enjoy it, you can support development with crypto. Any amount helps ship new versions.',
    d_warn: 'Send coins only on the network shown on the card. A transfer on another network may be lost.',
    d_thanks: 'Thank you for being here.',
    copy: 'Copy address', copied: 'Copied',
    vg_title: 'Also by the author', more_sub: 'Leveler is made by one developer. Here are four more free projects: for video in the browser, for screenshots and for a home server.', more_site: 'Website', more_dl: 'Download',
    vg_kind: 'Extension for Chrome, Edge and Firefox', vg_desc: 'A soft light in the colours of the picture around any video, like a strip behind a TV. Works on YouTube, Twitch and any other site, and in fullscreen.',
    vg_c1: 'Blur or LED strip', vg_c2: 'Room colour', vg_c3: 'Fullscreen', vg_c4: 'Presets',
    sn_kind: 'App for Windows, macOS and Linux', sn_desc: 'A fast, lightweight, open-source screenshot tool: press PrtSc, select an area, add an arrow or a caption and copy it. No accounts, no cloud.',
    sn_c1: 'One PrtSc key', sn_c2: 'Annotations', sn_c3: 'No cloud', sn_c4: 'A few megabytes', sn_url: 'https://vkardin.github.io/snapt/', sn_dl: 'https://vkardin.github.io/snapt/#download',
    fl_kind: 'Extension for Chrome, Edge and Firefox', fl_desc: 'Pops any web video out into a floating window that stays on top, keeps the site\'s subtitles with it and remembers the second you stopped at. Bookmarks with notes and Markdown export.',
    fl_c1: 'Floating window', fl_c2: 'Subtitles included', fl_c3: 'Continue from 12:34', fl_c4: 'Notes to Markdown',
    uni_kind: 'Telegram bot for a home server', uni_desc: 'Your home server in Telegram: apps in one grid, monitoring, a news digest and server repair in the chat and a mini app. Installs with one command. Russian interface.',
    uni_c1: 'Mini app', uni_c2: 'Monitoring', uni_c3: 'News digest', uni_c4: 'Self-hosted',
    privacy: 'Privacy'
  }
};

function pickLang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (T[q]) return q;
  try { const s = localStorage.getItem('lv-lang'); if (T[s]) return s; } catch (e) {}
  for (const l of navigator.languages || [navigator.language || 'en']) {
    const c = String(l).slice(0, 2).toLowerCase();
    if (c === 'uk' || c === 'ru' || c === 'en') return c;
    if (c === 'be') return 'ru';
  }
  return 'en';
}

let lang = pickLang();

function apply() {
  const t = T[lang];
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const v = (el.dataset.i18n in t) ? t[el.dataset.i18n] : (window.PAGE_T && PAGE_T[lang][el.dataset.i18n]);
    if (v != null) el.textContent = v;
  });
  document.title = (window.PAGE_T && PAGE_T[lang].title) || t.title;
  document.querySelectorAll('[data-shot]').forEach(img => { img.src = `img/${img.dataset.shot}-${lang}.webp`; });
  document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  document.querySelectorAll('[data-ph]').forEach(el => {
    const v = (window.PAGE_T && PAGE_T[lang][el.dataset.ph]) || t[el.dataset.ph];
    if (v != null) el.placeholder = v;
  });
  document.querySelectorAll('[data-href]').forEach(el => { if (t[el.dataset.href]) el.href = t[el.dataset.href]; });
  document.querySelectorAll('.copy').forEach(b => { if (!b.classList.contains('done')) b.textContent = t.copy; });
}

function renderWallets() {
  const box = document.getElementById('wallets');
  const tpl = document.getElementById('wallet');
  if (!box || !tpl) return;
  for (const w of WALLETS) {
    const n = tpl.content.cloneNode(true);
    const i = n.querySelector('.coin i');
    i.textContent = w.sign; i.style.background = w.color;
    n.querySelector('.coin b').textContent = w.name;
    n.querySelector('.coin small').textContent = w.net;
    n.querySelector('.qr img').src = `qr/${w.id}.svg`;
    n.querySelector('.qr img').alt = `QR ${w.name}`;
    n.querySelector('.addr').textContent = w.addr;
    const btn = n.querySelector('.copy');
    btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(w.addr); }
      catch (e) {
        const r = document.createRange(); r.selectNodeContents(btn.previousElementSibling);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('copy');
      }
      btn.classList.add('done'); btn.textContent = T[lang].copied;
      setTimeout(() => { btn.classList.remove('done'); btn.textContent = T[lang].copy; }, 1800);
    });
    box.appendChild(n);
  }
}

function setStores() {
  for (const k of ['chrome', 'firefox']) {
    document.querySelectorAll('.store-' + k).forEach(a => {
      if (STORES[k]) { a.href = STORES[k]; a.target = '_blank'; a.rel = 'noopener'; }
      else { a.href = '#install'; a.removeAttribute('target'); }
    });
  }
}

// Демонстрация: уровень сигнала фильма без обработки и после компрессора.
// Звук синтетический: тихие диалоги чередуются со взрывами и музыкой.
function setupDemo() {
  const cb = document.getElementById('demoBefore');
  const ca = document.getElementById('demoAfter');
  if (!cb || !ca) return;
  const BARS = 64, STEP = 70; // столбиков на экране, мс на столбик
  const TALK = '#f2c66d', BOOM = '#ff6b6b';
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // Сцены: [вид, длина в столбиках]
  const SCENES = [['t', 26], ['b', 9], ['t', 20], ['m', 14], ['t', 18], ['b', 12]];
  const stream = [];
  for (let k = 0; k < 4; k++) for (const [kind, len] of SCENES) {
    for (let j = 0; j < len; j++) {
      let v;
      if (kind === 't') v = (j % 7 === 6) ? 0.02 : 0.1 + rnd() * 0.12;           // реплики с паузами
      else if (kind === 'b') v = Math.max(0.35, 1 - j / len * 0.6) * (0.85 + rnd() * 0.15); // удар и затухание
      else v = 0.55 + rnd() * 0.25;                                              // музыка
      stream.push({ v, loud: kind !== 't' });
    }
  }
  // Упрощённый компрессор: порог, степень сжатия и компенсация усиления.
  const level = v => v < 0.04 ? v : Math.min(0.62, 0.4 + (v - 0.25) * 0.22);

  function size(c) {
    const r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    c.width = Math.round(r.width * d); c.height = Math.round(r.height * d);
  }
  function draw(c, pos, map) {
    const g = c.getContext('2d'), w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    const bw = w / BARS, mid = h / 2;
    const css = getComputedStyle(document.documentElement);
    g.strokeStyle = css.getPropertyValue('--line'); g.lineWidth = 1;
    g.setLineDash([4, 4]);
    for (const y of [mid - mid * 0.4, mid + mid * 0.4]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.setLineDash([]);
    const start = Math.floor(pos), frac = pos - start;
    for (let i = 0; i <= BARS; i++) {
      const s = stream[(start + i) % stream.length];
      const a = map(s.v) * (mid - 2);
      g.fillStyle = s.loud ? BOOM : TALK;
      const x = (i - frac) * bw;
      g.beginPath();
      g.roundRect ? g.roundRect(x + bw * 0.18, mid - a, bw * 0.64, a * 2, bw * 0.3) : g.rect(x + bw * 0.18, mid - a, bw * 0.64, a * 2);
      g.fill();
    }
  }
  let pos = 0, last = 0, raf = 0, visible = false;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  function frame(t) {
    raf = 0;
    if (last) pos = (pos + (t - last) / STEP) % stream.length;
    last = t;
    draw(cb, pos, v => v); draw(ca, pos, level);
    if (visible && !still.matches && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function kick() { last = 0; if (!raf) raf = requestAnimationFrame(frame); }
  const resize = () => { size(cb); size(ca); kick(); };
  new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible) kick(); }).observe(cb);
  document.addEventListener('visibilitychange', kick);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', kick);
  addEventListener('resize', resize);
  resize();
}

document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
  lang = b.dataset.lang;
  try { localStorage.setItem('lv-lang', lang); } catch (e) {}
  apply();
}));
const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
function tr(k) { return (window.PAGE_T && PAGE_T[lang][k]) || T[lang][k] || k; }

function setupFeedback() {
  const f = document.getElementById('fbForm');
  if (!f || !FEEDBACK_TO) return;
  f.hidden = false;
  const st = document.getElementById('fbStatus');
  const btn = f.querySelector('button[type=submit]');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (f._honey.value) return;
    const kind = f.kind.value;
    const data = {
      _subject: `Leveler: ${kind === 'idea' ? 'идея' : kind === 'bug' ? 'ошибка' : 'сообщение'}`,
      _template: 'table',
      kind,
      message: f.message.value.trim(),
      email: f.email.value.trim(),
      lang,
      browser: navigator.userAgent
    };
    if (data.email) data._replyto = data.email;
    btn.disabled = true; st.className = 'fb-status'; st.textContent = tr('f_sending');
    try {
      const r = await fetch('https://formsubmit.co/ajax/' + FEEDBACK_TO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data)
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || String(j.success) === 'false') throw new Error(j.message || r.status);
      f.reset(); st.className = 'fb-status ok'; st.textContent = tr('f_ok');
    } catch (err) {
      st.className = 'fb-status err'; st.textContent = tr('f_err');
    } finally { btn.disabled = false; }
  });
}

renderWallets();
setStores();
setupFeedback();
setupDemo();
apply();
