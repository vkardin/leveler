<p align="center"><img src="docs/img/logo.svg" width="96" alt="Leveler"></p>

<h1 align="center">Leveler</h1>

<p align="center"><b>Ровная громкость любого видео в браузере</b><br>
<a href="README.md">English</a> · Русский · <a href="README.uk.md">Українська</a></p>

<p align="center">
<a href="https://chromewebstore.google.com/detail/phbjpipnbhffcegccfbbfabbhmgaelko"><img alt="Chrome Web Store" src="https://img.shields.io/chrome-web-store/v/phbjpipnbhffcegccfbbfabbhmgaelko?label=Chrome&logo=googlechrome&logoColor=white"></a>
<a href="https://addons.mozilla.org/"><img alt="Firefox Add-ons" src="https://img.shields.io/badge/Firefox-soon-lightgrey?logo=firefoxbrowser&logoColor=white"></a>
<a href="https://vkardin.github.io/leveler/"><img alt="Website" src="https://img.shields.io/badge/site-vkardin.github.io%2Fleveler-222"></a>
<a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

Leveler выравнивает звук любого HTML5-видео и аудио: тихие диалоги громче, взрывы тише, и фильм можно смотреть ночью, не держа руку на регуляторе. Ещё он усиливает громкость до 400 % и меняет скорость от 0.25× до 4× без изменения высоты голоса. Бесплатно, без регистрации, всё работает на вашем устройстве.

<p align="center"><img src="docs/img/presets-ru.png" width="720" alt="Окно Leveler"></p>

## Установка

- **Chrome, Edge, Brave, Opera:** [Chrome Web Store](https://chromewebstore.google.com/detail/phbjpipnbhffcegccfbbfabbhmgaelko)
- **Firefox:** Firefox Add-ons (скоро)
- **Вручную:** скачайте `leveler-chrome-<версия>.zip` на странице [Releases](../../releases), распакуйте, откройте `chrome://extensions`, включите **Режим разработчика** и нажмите **Загрузить распакованное** → выберите распакованную папку. Firefox: `about:debugging#/runtime/this-firefox` → **Загрузить временное дополнение…** → `manifest.json` из `leveler-firefox-<версия>.zip`.

## Возможности

- Пресеты: «Ночной режим» (сильное сжатие), «Диалоги громче», «Наушники», «Бас+», «Выкл». После установки стоит «Выкл»: звук не обрабатывается, пока вы не выберете пресет
- Один ползунок «Выровнять звук» или полная настройка: порог, степень сжатия, мягкость, атака, восстановление, усиление; срез низов и эквалайзер на 3 полосы
- Усиление громкости до 400 % с защитным лимитером, индикатор уровня до и после компрессии
- Свои пресеты: сохранить, переименовать, удалить; пресет, громкость и скорость запоминаются для каждого сайта
- Скорость 0.25–4× без «мультяшного» голоса, горячие клавиши `[` `]` `\` (настраиваются), короткий оверлей со скоростью
- Догон прямого эфира (по умолчанию выключен): если трансляция на Twitch, YouTube или Kick отстала, воспроизведение немного ускоряется (до 1.2×), пока запас буфера не станет безопасным, без перескоков и лишних подгрузок
- Работает в iframe и на весь экран, находит видео, которые появились позже, начинает работать в открытых вкладках сразу после установки
- Плавное включение и выключение без перезагрузки страницы; резервная копия всех настроек в JSON
- Светлая и тёмная тема, English, Русский, Українська

| Пресеты и индикатор уровня | Компрессор и эквалайзер | Скорость и усиление |
|---|---|---|
| ![Пресеты и индикатор уровня](docs/img/presets-ru.png) | ![Компрессор и эквалайзер](docs/img/compressor-ru.png) | ![Скорость и усиление](docs/img/speed-ru.png) |

## Сайты с DRM

Netflix, Кинопоиск, Okko, Иви и другие сервисы с защитой DRM не дают расширениям обрабатывать звук: браузер отдаёт в Web Audio только тишину. Leveler распознаёт это до подключения, не трогает звук и пишет «Этот сайт не поддерживает обработку звука». Скорость там работает.

## Проверено

- Автотест в Chromium на локальной странице: `node store/tests/run.js` (звуковая цепочка, пресеты, настройки сайтов, горячие клавиши, резервная копия, откат для DRM/CORS)
- YouTube в Google Chrome: работает (проверил автор после перезагрузки вкладки)
- Twitch, другие плееры, Firefox: ещё не проверено. [Напишите](../../issues/new/choose), что получилось

## Конфиденциальность

Leveler не собирает данные и ничего никуда не отправляет: звук обрабатывается на вашем устройстве. [Политика конфиденциальности](store/PRIVACY.md).

## Обратная связь и поддержка

- Идеи и ошибки: [GitHub Issues](../../issues/new/choose) или [страница поддержки](https://vkardin.github.io/leveler/support.html)
- Поддержать проект: [vkardin.github.io/leveler/#donate](https://vkardin.github.io/leveler/#donate)

## Репозиторий

| Папка | Что внутри |
|---|---|
| [`extension/`](extension) | Исходники расширения (загрузка через `chrome://extensions` → Режим разработчика → Загрузить распакованное) |
| [`docs/`](docs) | Сайт для GitHub Pages |
| [`store/`](store) | Тексты для магазинов, скриншоты, политика конфиденциальности, скрипты тестов и скриншотов |
| [`tools/`](tools) | `build.py` собирает `leveler-chrome-<версия>.zip` и `leveler-firefox-<версия>.zip` |

## Ещё от автора

<a href="https://vkardin.github.io/video-glow/"><img src="docs/img/video-glow.svg" width="56" align="left" alt="Video Glow"></a>

**[Video Glow](https://vkardin.github.io/video-glow/)**: подсветка в цвет картинки вокруг любого видео в браузере, как лента за телевизором. Бесплатно для Chrome и Firefox. [Сайт](https://vkardin.github.io/video-glow/) · [GitHub](https://github.com/vkardin/video-glow)

<br clear="left">

<a href="https://vkardin.github.io/snapt/ru/"><img src="docs/img/snapt.svg" width="56" align="left" alt="Snapt"></a>

**[Snapt](https://vkardin.github.io/snapt/ru/)**: быстрая и лёгкая программа для скриншотов с открытым кодом для Windows, macOS и Linux. Выделите область, добавьте стрелку или подпись и скопируйте. Без аккаунтов и облака. [Сайт](https://vkardin.github.io/snapt/ru/) · [GitHub](https://github.com/vkardin/snapt)

<br clear="left">

## Лицензия

[MIT](LICENSE) © vkardin
