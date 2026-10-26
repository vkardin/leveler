#!/usr/bin/env python3
"""Сборка Leveler для Chrome и Firefox из одной папки исходников.

    python3 tools/build.py [папка-исходников] [папка-вывода] [--version 0.1.0]

По умолчанию: extension → dist, версия берётся из extension/manifest.json.
На выходе leveler-chrome-<версия>.zip и leveler-firefox-<версия>.zip.

Главный манифест — Chrome. Firefox-манифест получается из него автоматически,
поэтому скрипты и всё остальное в обеих сборках одинаковое.

Перед упаковкой проверяется: версия, наличие файлов из манифеста, одинаковые
ключи во всех _locales, синтаксис JS (если установлен node).
"""
import argparse, json, os, re, shutil, subprocess, sys, zipfile

GECKO = {
    "id": "{8170d0d4-d145-4045-9cbf-59637e087d27}",
    "strict_min_version": "128.0",
    "data_collection_permissions": {"required": ["none"]},
}


def fail(msg):
    sys.exit("ОШИБКА: " + msg)


def firefox_manifest(m):
    m = json.loads(json.dumps(m))
    m.pop("minimum_chrome_version", None)
    sw = m.get("background", {}).get("service_worker")
    if sw:
        m["background"] = {"scripts": [sw]}
    m["browser_specific_settings"] = {"gecko": GECKO}
    return m


def check(src, m):
    files = []
    for cs in m.get("content_scripts", []):
        files += cs.get("js", []) + cs.get("css", [])
    files += [m.get("background", {}).get("service_worker", "")]
    files += [m.get("action", {}).get("default_popup", ""), m.get("options_ui", {}).get("page", "")]
    files += list(m.get("icons", {}).values())
    for f in filter(None, files):
        if not os.path.isfile(os.path.join(src, f)):
            fail("нет файла из манифеста: " + f)

    loc = os.path.join(src, "_locales")
    keys = {}
    for lang in sorted(os.listdir(loc)):
        with open(os.path.join(loc, lang, "messages.json"), encoding="utf-8") as fh:
            keys[lang] = set(json.load(fh))
    base = keys.get(m.get("default_locale", "en"))
    if base is None:
        fail("нет _locales/%s" % m.get("default_locale"))
    for lang, k in keys.items():
        if k != base:
            fail("в _locales/%s не совпадают ключи: нет %s, лишние %s" %
                 (lang, sorted(base - k)[:5], sorted(k - base)[:5]))

    if shutil.which("node"):
        for root, _, names in os.walk(src):
            for n in names:
                if n.endswith(".js"):
                    p = os.path.join(root, n)
                    r = subprocess.run(["node", "--check", p], capture_output=True, text=True)
                    if r.returncode:
                        fail("синтаксис %s:\n%s" % (p, r.stderr))
    else:
        print("node не найден — проверка синтаксиса JS пропущена")


# Из PNG убираются служебные блоки метаданных: остаётся только картинка.
PNG_KEEP = {b"IHDR", b"PLTE", b"tRNS", b"IDAT", b"IEND", b"gAMA", b"sRGB", b"cHRM", b"pHYs"}


def png_clean(d):
    if d[:8] != b"\x89PNG\r\n\x1a\n":
        return d
    out, i = [d[:8]], 8
    while i + 8 <= len(d):
        n = int.from_bytes(d[i:i + 4], "big")
        if d[i + 4:i + 8] in PNG_KEEP:
            out.append(d[i:i + 12 + n])
        i += 12 + n
    return b"".join(out)


# Из SVG убирается блок <metadata>.
def svg_clean(d):
    t = d.decode("utf-8")
    t = re.sub(r"<metadata\b.*?</metadata>", "", t, flags=re.S)
    return t.encode("utf-8")


def clean(path, d):
    p = path.lower()
    if p.endswith(".png"):
        return png_clean(d)
    if p.endswith(".svg"):
        return svg_clean(d)
    return d


def pack(src, manifest, out_zip):
    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, names in os.walk(src):
            dirs[:] = sorted(d for d in dirs if not d.startswith("."))
            for n in sorted(names):
                if n.startswith(".") or n == "manifest.json" and root == src:
                    continue
                p = os.path.join(root, n)
                with open(p, "rb") as fh:
                    z.writestr(os.path.relpath(p, src), clean(p, fh.read()))
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src", nargs="?", default="extension")
    ap.add_argument("out", nargs="?", default="dist")
    ap.add_argument("--version", help="переопределить версию из manifest.json (например, для релиза по тегу)")
    a = ap.parse_args()

    with open(os.path.join(a.src, "manifest.json"), encoding="utf-8") as fh:
        m = json.load(fh)
    ver = a.version or m.get("version", "")
    if not re.fullmatch(r"\d+(\.\d+){0,3}", ver):
        fail("версия должна быть вида 1.2.0 или 1.1.2.1, а не %r" % ver)
    m["version"] = ver
    check(a.src, m)
    os.makedirs(a.out, exist_ok=True)
    for name, man in (("chrome", m), ("firefox", firefox_manifest(m))):
        z = os.path.join(a.out, "leveler-%s-%s.zip" % (name, ver))
        pack(a.src, man, z)
        print("готово:", z)


if __name__ == "__main__":
    main()
