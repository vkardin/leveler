<p align="center"><img src=".github/assets/project-banner.svg" alt="Leveler by vkardin" width="100%"></p>

<h1 align="center">Leveler</h1>

<p align="center"><b>Even out the loudness of any video in your browser</b><br>
English · <a href="README.ru.md">Русский</a> · <a href="README.uk.md">Українська</a></p>

<p align="center">
<a href="https://chromewebstore.google.com/detail/phbjpipnbhffcegccfbbfabbhmgaelko"><img alt="Chrome Web Store" src="https://img.shields.io/chrome-web-store/v/phbjpipnbhffcegccfbbfabbhmgaelko?label=Chrome&logo=googlechrome&logoColor=white"></a>
<a href="https://addons.mozilla.org/firefox/addon/leveler/"><img alt="Firefox Add-ons" src="https://img.shields.io/amo/v/leveler?label=Firefox&logo=firefoxbrowser&logoColor=white"></a>
<a href="https://vkardin.github.io/leveler/"><img alt="Website" src="https://img.shields.io/badge/site-vkardin.github.io%2Fleveler-222"></a>
<a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

Leveler evens out the sound of any HTML5 video or audio: quiet dialogue gets louder, explosions get softer, so you can watch a movie at night without reaching for the volume. It also boosts the volume up to 400 % and changes playback speed from 0.25× to 4× without changing the pitch. Free, no account, everything runs on your device.

<p align="center"><img src="docs/img/presets-en.png" width="720" alt="Leveler popup"></p>

## Install

- **Chrome, Edge, Brave, Opera:** [Chrome Web Store](https://chromewebstore.google.com/detail/phbjpipnbhffcegccfbbfabbhmgaelko)
- **Firefox:** [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/leveler/)
- **Manual install:** download `leveler-chrome-<version>.zip` from [Releases](../../releases), unzip it, open `chrome://extensions`, turn on **Developer mode** and click **Load unpacked** → choose the unzipped folder. Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → `manifest.json` from `leveler-firefox-<version>.zip`.

## New in 1.5

- Compare original and processed audio temporarily in the current tab; closing the popup restores processing automatically.
- Disable processing per site, restore the current preset, reset EQ/stereo, and undo the last editing gesture.
- Choose which source drives the meters and see compressor/limiter gain reduction.
- Search, edit and copy site profiles. Backups include background-tab audio focus settings.
- Debounced profile writes finish in the background even if the popup closes immediately. Invalid extension runtimes exit before audio takeover.

## Features

- Presets: Night mode (strong compression), Louder dialogue, Podcasts, Headphones, Bass+, Music, Off. After install the preset is Off and nothing is processed until you pick one
- One “Level the sound” slider or full control: threshold, ratio, knee, attack, release, makeup gain; low cut and 3-band equalizer
- Volume boost up to 400 % with a safety limiter, level meter before / after compression
- Pan, left/right balance and forced mono, remembered for each site (handy with one earbud or a broken speaker)
- Your own presets: save, rename, delete; preset, volume and speed are remembered for each site
- Playback speed 0.25–4× without the chipmunk voice, hotkeys `[` `]` `\` (configurable), short speed overlay
- Live stream catch-up (off by default): if a stream on Twitch, YouTube or Kick falls behind, playback speeds up a little (up to 1.2×) until the buffer is back to a safe margin, without jumps or extra buffering
- Works in iframes and fullscreen, picks up videos added later, starts in open tabs right after install
- Smooth on / off without reloading the page; backup of all settings to a JSON file
- Background tabs (off by default): when sound starts in the tab you are looking at, other tabs with sound pause or get quieter and continue when it stops
- Light and dark theme, English, Русский, Українська

| Presets and level meter | Compressor and equalizer | Speed and volume boost |
|---|---|---|
| ![Presets and level meter](docs/img/presets-en.png) | ![Compressor and equalizer](docs/img/compressor-en.png) | ![Speed and volume boost](docs/img/speed-en.png) |

## Sites with DRM

Netflix, Disney+, Prime Video and other services with DRM protection do not let extensions process their sound: the browser gives Web Audio only silence. Leveler detects this before connecting, leaves the sound untouched and shows “This site does not support audio processing”. Speed control still works there.

## Tested

- Automated test in Chromium on a local page: `node store/tests/run.js` (sound chain, presets, per-site settings, hotkeys, backup, DRM/CORS fallback, background tabs). Runs in GitHub Actions for every pull request and push to `main`
- YouTube in Google Chrome: works (checked by the author after reloading the tab)
- Twitch, other players, Firefox: not verified yet. Please [report](../../issues/new/choose) what you find

## Privacy

Leveler collects no data and sends nothing anywhere: the sound is processed on your device. [Privacy policy](store/PRIVACY.md).

## Feedback and support

- Ideas and bug reports: [GitHub Issues](../../issues/new/choose) or the [support page](https://vkardin.github.io/leveler/support.html)
- Support the project: [vkardin.github.io/leveler/#donate](https://vkardin.github.io/leveler/#donate)

## Repository

| Folder | What is inside |
|---|---|
| [`extension/`](extension) | Extension source (load via `chrome://extensions` → Developer mode → Load unpacked) |
| [`docs/`](docs) | Website, served by GitHub Pages |
| [`store/`](store) | Store texts, screenshots, privacy policy, test and screenshot scripts |
| [`tools/`](tools) | `build.py` packs `leveler-chrome-<version>.zip` and `leveler-firefox-<version>.zip` |
| [`.github/workflows/`](.github/workflows) | `test.yml` runs the build checks and the automated test; `release.yml` publishes a release with both zips when a new version from `manifest.json` reaches `main` (or on demand: Actions → Release → Run workflow) |


## License

[MIT](LICENSE) © vkardin

### Additional regression checks

Run `node --test --test-concurrency=1 store/tests/v15.test.cjs` with Playwright installed. These tests use real Chromium Web Audio and local media with extension API stubs. `CHROMIUM_PATH` can select an existing Chromium binary. The original `store/tests/run.js` additionally tests the installed extension and requires a full Chromium build with extension support.

<!-- project-family:start -->

[**vkardin / tools — all projects ↗**](https://vkardin.github.io/)
## More tools by vkardin

| Project | Projects |
| --- | --- |
| **[Video Glow](https://vkardin.github.io/video-glow/)** | Ambient light around web videos. Soft glow, LED strips and room colour. [GitHub](https://github.com/vkardin/video-glow) |
| **[Video Drift](https://vkardin.github.io/video-drift/)** | Floating video with subtitles, saved playback positions and timestamped notes. [GitHub](https://github.com/vkardin/video-drift) |
| **[Snapt](https://vkardin.github.io/snapt/)** | Capture, annotate and export. A Windows, macOS and Linux app, plus a browser extension. [GitHub](https://github.com/vkardin/snapt) |
| **[UNI](https://vkardin.github.io/uni-homebot/)** | Your home server in Telegram: apps, monitoring, notifications and a Mini App. [GitHub](https://github.com/vkardin/uni-homebot) |
| **[Коли Є](https://vkardin.github.io/koly/)** | Power outage schedules for every region of Ukraine: status now, a countdown, today and tomorrow. Windows widget. [GitHub](https://github.com/vkardin/koly) |
| **[Tukk](https://vkardin.github.io/tukk/)** | Phone gestures for everyday actions: shake for the flashlight, flip for silence. Android, in development. [GitHub](https://github.com/vkardin/tukk) |

[github.com/vkardin](https://github.com/vkardin) · Independent tools · open source
<!-- project-family:end -->
