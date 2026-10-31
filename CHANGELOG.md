# Changelog

## 1.1.0

- Clearer popup message on sites where the sound cannot be processed: it says why (DRM-protected video such as Netflix, or sound from another server) and that speed control still works. On DRM sites it shows right away, and the sound sliders are dimmed
- Badge on the toolbar icon with the volume boost (for example 200%) while it is applied in the tab
- "Reset this site" confirms with "Done"
- New built-in presets: Podcasts and Music
- Stereo section in the popup: pan, left/right balance and forced mono. Remembered for each site, presets do not change it
- Live stream catch-up (off by default, switch in the popup and on the settings page): a stream that fell behind is played slightly faster (1.1–1.2×, pitch preserved) until the buffer is down to a safe margin, then back to 1×. No seeking, so no extra buffering; after a stall the margin grows. Leaves alone recorded parts of a stream (DVR), your own speed and players that manage speed themselves
- Background tabs (settings page, off by default): when sound starts in the tab you are looking at, other tabs with sound pause or get quieter, and continue when it stops. Short sounds such as notifications are ignored
- Buttons under the popup: All settings, Website, Support the project
- Firefox Add-ons listing linked on the website and in the READMEs

## 1.0.0

First public version.

- Evens out loudness of any HTML5 video or audio: quiet dialogue louder, explosions softer (Web Audio: low cut, 3-band EQ, compressor, makeup gain, safety limiter)
- "Level the sound" slider plus full compressor and equalizer controls
- Built-in presets: Night mode, Louder dialogue, Headphones, Bass+, Off. Off is the default after install: nothing is processed until you pick a preset
- Your own presets: save, rename, delete
- Preset and speed are remembered for each site; iframes use the settings of the tab's site
- Playback speed 0.25–4× without changing the pitch, short speed overlay on the video
- Speed hotkeys `[` `]` `\`, configurable on the settings page
- Level meter before/after compression in the popup (works only while the popup is open)
- Backup: export and import of all settings as JSON
- DRM and cross-origin media are detected and left untouched; the popup says "This site does not support audio processing"
- Works in iframes and fullscreen, picks up videos added later, starts in already open tabs right after install or update
- Light and dark theme, English / Русский / Українська
- Chrome, Edge, Brave, Opera and Firefox builds
