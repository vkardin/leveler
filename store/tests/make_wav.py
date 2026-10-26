#!/usr/bin/env python3
"""Тестовый звук для run.js: чередование тихих «диалогов» и громких «взрывов».

    python3 make_wav.py out.wav

3 с тона 220 Гц на −36 dBFS, затем 3 с на −3 dBFS, дважды (12 с, моно, 48 кГц)."""
import math, struct, sys, wave

RATE = 48000


def tone(sec, db, freq=220):
    amp = 10 ** (db / 20)
    return [amp * math.sin(2 * math.pi * freq * i / RATE) for i in range(int(sec * RATE))]


samples = (tone(3, -36) + tone(3, -3)) * 2
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(RATE)
    w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32767)) for s in samples))
