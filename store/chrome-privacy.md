# Chrome Web Store → «Меры по обеспечению конфиденциальности» / Privacy practices

Готовые тексты для вкладки. Разрешения сверены с `extension/manifest.json` (1.0.0): `storage`, `scripting`, `host_permissions: <all_urls>`. Все три действительно используются, лишних нет.

## Русский (как в панели разработчика)

**Описание единственной цели**
Leveler выравнивает громкость звука в HTML5-видео и аудио на веб-страницах (тихие диалоги громче, громкие сцены тише) с помощью локального компрессора и эквалайзера, а также позволяет менять скорость воспроизведения. Других функций у расширения нет.

**Обоснование разрешения «storage»**
Сохраняет настройки пользователя: включено ли расширение, встроенные и собственные пресеты звука, выбранный пресет и скорость для каждого сайта, горячие клавиши, а также локальный список сайтов, где обработка звука невозможна (DRM). Данные хранятся только в браузере пользователя (chrome.storage) и никуда не передаются.

**Обоснование разрешения «scripting»**
Сразу после установки или обновления расширение внедряет свой content script во вкладки, которые уже открыты, чтобы обработка звука и смена скорости работали без перезагрузки страниц. Popup также использует его, если на текущей странице скрипт ещё не загружен. Внедряются только файлы из пакета расширения.

**Обоснование разрешений на доступ к хостам (<all_urls>)**
Видео и аудио могут находиться на любом сайте и во встроенных фреймах, поэтому content script запускается на всех страницах. Он только находит элементы <video>/<audio>, пропускает их звук через локальную цепочку Web Audio (компрессор, эквалайзер, усиление) и меняет скорость воспроизведения по команде пользователя. Содержимое страниц не читается, не сохраняется и не передаётся.

**Используете ли вы удалённый код?**
Нет, я не использую удалённый код. Весь JavaScript находится в пакете расширения; внешние скрипты, eval и загрузка кода с серверов не используются.

**Использование данных**
Ни один тип данных не отмечать: расширение не собирает и не передаёт никаких пользовательских данных.
Поставить все три галочки подтверждения: данные не продаются третьим лицам; не используются и не передаются в целях, не связанных с единственной целью продукта; не используются для определения кредитоспособности.

**Политика конфиденциальности (URL)**
https://github.com/vkardin/leveler/blob/main/store/PRIVACY.md

## English

**Single purpose description**
Leveler evens out the loudness of HTML5 video and audio on web pages (quiet dialogue louder, loud scenes quieter) using a local compressor and equalizer, and lets the user change the playback speed. The extension has no other functionality.

**Justification for "storage"**
Saves the user's settings: whether the extension is on, built-in and custom sound presets, the selected preset and speed for each site, hotkeys, and a local list of sites where sound cannot be processed (DRM). Data stays in the user's browser (chrome.storage) and is never transmitted.

**Justification for "scripting"**
Right after install or update, the extension injects its content script into tabs that are already open, so sound processing and speed control work without reloading those pages. The popup also uses it when the current page does not have the script yet. Only files from the extension package are injected.

**Host permission justification (<all_urls>)**
Videos and audio can be on any site and inside embedded frames, so the content script runs on all pages. It only finds <video>/<audio> elements, routes their sound through a local Web Audio chain (compressor, equalizer, gain) and changes the playback speed on the user's command. Page content is not read, stored or transmitted.

**Are you using remote code?**
No, I am not using remote code. All JavaScript is included in the extension package; no external scripts, eval or code downloaded from servers.

**Data usage**
Do not tick any data type: the extension does not collect or transmit any user data.
Tick all three certifications: not sold to third parties; not used or transferred for purposes unrelated to the item's single purpose; not used to determine creditworthiness.

## Opera Add-ons
Promotional image 300×188: `store/promo/opera_300x188.png`.
