<p align="center"><img src=".github/assets/project-banner.svg" alt="Leveler by vkardin" width="100%"></p>

<h1 align="center">Leveler</h1>

<p align="center"><b>Ровная громкость любого видео в браузере</b><br>
<a href="README.md">English</a> · Русский · <a href="README.uk.md">Українська</a></p>

<p align="center">
<a href="https://chromewebstore.google.com/detail/phbjpipnbhffcegccfbbfabbhmgaelko"><img alt="Chrome Web Store" src="https://img.shields.io/chrome-web-store/v/phbjpipnbhffcegccfbbfabbhmgaelko?label=Chrome&logo=googlechrome&logoColor=white"></a>
<a href="https://addons.mozilla.org/firefox/addon/leveler/"><img alt="Firefox Add-ons" src="https://img.shields.io/amo/v/leveler?label=Firefox&logo=firefoxbrowser&logoColor=white"></a>
<a href="https://vkardin.github.io/leveler/"><img alt="Website" src="https://img.shields.io/badge/site-vkardin.github.io%2Fleveler-222"></a>
<a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

Leveler выравнивает звук любого HTML5-видео и аудио: тихие диалоги громче, взрывы тише, и фильм можно смотреть ночью, не держа руку на регуляторе. Ещё он усиливает громкость до 400 % и меняет скорость от 0.25× до 4× без изменения высоты голоса. Бесплатно, без регистрации, всё работает на вашем устройстве.

<p align="center"><img src="docs/img/presets-ru.png" width="720" alt="Окно Leveler"></p>

## Установка

- **Chrome, Edge, Brave, Opera:** [Chrome Web Store](https://chromewebstore.google.com/detail/phbjpipnbhffcegccfbbfabbhmgaelko)
- **Firefox:** [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/leveler/)
- **Вручную:** скачайте `leveler-chrome-<версия>.zip` на странице [Releases](../../releases), распакуйте, откройте `chrome://extensions`, включите **Режим разработчика** и нажмите **Загрузить распакованное** → выберите распакованную папку. Firefox: `about:debugging#/runtime/this-firefox` → **Загрузить временное дополнение…** → `manifest.json` из `leveler-firefox-<версия>.zip`.

## Новое в 1.5

- Временное сравнение оригинала с обработкой в текущей вкладке; после закрытия popup обработка возвращается.
- Отключение звуковой обработки для сайта, возврат пресета, сброс EQ/стерео и отмена последнего изменения.
- Выбор источника индикаторов, показ сжатия компрессором и снижения лимитером.
- Поиск, редактирование и копирование профилей сайтов. Копии включают настройки фоновых вкладок.
- Фоновое сохранение завершает запись после закрытия popup; недоступный контекст расширения не перехватывает звуковую цепочку.

## Возможности

- Пресеты: «Ночной режим» (сильное сжатие), «Диалоги громче», «Подкасты», «Наушники», «Бас+», «Музыка», «Выкл». После установки стоит «Выкл»: звук не обрабатывается, пока вы не выберете пресет
- Один ползунок «Выровнять звук» или полная настройка: порог, степень сжатия, мягкость, атака, восстановление, усиление; срез низов и эквалайзер на 3 полосы
- Усиление громкости до 400 % с защитным лимитером, индикатор уровня до и после компрессии
- Панорама, баланс левого и правого канала и принудительное моно, запоминаются для каждого сайта (пригодится с одним наушником или сломанной колонкой)
- Свои пресеты: сохранить, переименовать, удалить; пресет, громкость и скорость запоминаются для каждого сайта
- Скорость 0.25–4× без «мультяшного» голоса, горячие клавиши `[` `]` `\` (настраиваются), короткий оверлей со скоростью
- Догон прямого эфира (по умолчанию выключен): если трансляция на Twitch, YouTube или Kick отстала, воспроизведение немного ускоряется (до 1.2×), пока запас буфера не станет безопасным, без перескоков и лишних подгрузок
- Работает в iframe и на весь экран, находит видео, которые появились позже, начинает работать в открытых вкладках сразу после установки
- Плавное включение и выключение без перезагрузки страницы; резервная копия всех настроек в JSON
- Фоновые вкладки (по умолчанию выключено): когда звук включается во вкладке, которую вы смотрите, остальные вкладки со звуком ставятся на паузу или звучат тише и продолжают, когда он стихает
- Светлая и тёмная тема, English, Русский, Українська

| Пресеты и индикатор уровня | Компрессор и эквалайзер | Скорость и усиление |
|---|---|---|
| ![Пресеты и индикатор уровня](docs/img/presets-ru.png) | ![Компрессор и эквалайзер](docs/img/compressor-ru.png) | ![Скорость и усиление](docs/img/speed-ru.png) |

## Сайты с DRM

Netflix, Кинопоиск, Okko, Иви и другие сервисы с защитой DRM не дают расширениям обрабатывать звук: браузер отдаёт в Web Audio только тишину. Leveler распознаёт это до подключения, не трогает звук и пишет «Этот сайт не поддерживает обработку звука». Скорость там работает.

## Проверено

- Автотест в Chromium на локальной странице: `node store/tests/run.js` (звуковая цепочка, пресеты, настройки сайтов, горячие клавиши, резервная копия, откат для DRM/CORS, фоновые вкладки). Запускается в GitHub Actions для каждого pull request и push в `main`
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
| [`.github/workflows/`](.github/workflows) | `test.yml` запускает проверки сборки и автотест; `release.yml` публикует релиз с обоими zip, когда в `main` приходит новая версия из `manifest.json` (или вручную: Actions → Release → Run workflow) |


## Лицензия

[MIT](LICENSE) © vkardin

<!-- project-family:start -->

[**vkardin / tools — каталог всех проектов ↗**](https://vkardin.github.io/)
## Другие инструменты от vkardin

| Проект | Описание |
| --- | --- |
| **[Video Glow](https://vkardin.github.io/video-glow/)** | Подсветка вокруг видео в цвет кадра. Мягкое свечение, LED-лента и цвет комнаты. [GitHub](https://github.com/vkardin/video-glow) |
| **[Video Drift](https://vkardin.github.io/video-drift/)** | Видео поверх других окон, субтитры, сохранение позиции и заметки к моментам. [GitHub](https://github.com/vkardin/video-drift) |
| **[Snapt](https://vkardin.github.io/snapt/)** | Скриншоты, стрелки и подписи. Приложение для Windows, macOS и Linux и расширение браузера. [GitHub](https://github.com/vkardin/snapt) |
| **[UNI](https://vkardin.github.io/uni-homebot/)** | Домашний сервер в Telegram: приложения, мониторинг, уведомления и мини-приложение. [GitHub](https://github.com/vkardin/uni-homebot) |
| **[Коли Є](https://vkardin.github.io/koly/ru/)** | Графики отключений света по всем областям Украины: статус сейчас, обратный отсчёт, сегодня и завтра. Виджет для Windows. [GitHub](https://github.com/vkardin/koly) |
| **[Tukk](https://vkardin.github.io/tukk/ru/)** | Жесты телефоном для повседневных действий: встряхнуть для фонарика, перевернуть для тишины. Android, в разработке. [GitHub](https://github.com/vkardin/tukk) |

[github.com/vkardin](https://github.com/vkardin) · Независимые инструменты · открытый код
<!-- project-family:end -->
