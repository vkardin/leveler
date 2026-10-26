# Opera Add-ons: поля и картинки

## Media
- Иконка 64×64: `store/promo/icon_64x64.png`
- Promotional image 300×188: `store/promo/opera_300x188.png`
- Скриншоты: `store/screenshots/<lang>/`

## General
| Поле | Значение |
|---|---|
| Service website URL | оставить пустым (расширение не связано ни с каким сервисом) |
| Extension support page URL | https://github.com/vkardin/leveler/issues |
| Extension source code URL (public) | https://github.com/vkardin/leveler |
| Extension source code URL (for moderators) | https://github.com/vkardin/leveler/tree/main/extension |
| Build instructions | текст ниже |
| License URL | https://github.com/vkardin/leveler/blob/main/LICENSE |
| Full license text | пусто (указан URL) |
| Privacy policy URL | https://github.com/vkardin/leveler/blob/main/store/PRIVACY.md |
| Full privacy policy text | пусто (указан URL) |

### Build instructions
```
The code is not minified or bundled: the package is the extension/ folder zipped as is.
1. Any OS (tested on Ubuntu 22.04 and Windows 11) with Python 3.8+ and git. No node/npm needed.
2. git clone https://github.com/vkardin/leveler && cd leveler
3. python3 tools/build.py
4. Result: dist/leveler-chrome-<version>.zip (this is the uploaded package).
```
