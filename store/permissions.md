# Permission justifications (Chrome Web Store → Privacy practices)

**storage** — saves the user's settings: on/off, presets, preset and speed for each site, hotkeys; and a local list of sites where sound cannot be processed.

**scripting** — right after install or update, the content script is injected into tabs that are already open, so the extension works without reloading them. Also used by the popup when a page has no content script yet.

**Host permission `<all_urls>`** — videos can be on any site. The content script finds `<video>`/`<audio>` elements, passes their sound through a local Web Audio chain (compressor, equalizer) and changes the playback speed when the user asks. Nothing is read from or sent about the page.

**Background service worker** — only listens for install/update to inject the content script into open tabs.

**Remote code** — none. All code is in the package.

**Data usage** — no user data is collected or transmitted. Certify: not sold, not used for unrelated purposes, not used for creditworthiness.
