# Privacy Policy — Leveler

**Leveler does not collect, store on a server, transmit, sell or share any personal data.**

- The extension processes the sound of the video or audio you are playing entirely inside your browser, using the Web Audio API, only to even out its loudness. The sound is never recorded, saved, uploaded or sent anywhere.
- Your settings (on/off, presets, per-site preset and speed, hotkeys) are stored in your browser via `chrome.storage.sync`. If you are signed in to your browser with sync turned on, the browser itself syncs them between your devices; Leveler has no server of its own.
- The list of sites where sound processing is not possible is kept locally in `chrome.storage.local`.
- The extension makes no network requests, uses no analytics, no telemetry, no ads and no remote code.
- The "all sites" access is used only to find `<video>` and `<audio>` elements on pages, process their sound and change their playback speed.

Questions: https://github.com/vkardin/leveler/issues

Last updated: 2026-10-26
