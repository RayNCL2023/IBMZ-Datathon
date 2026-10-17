"""Soundtrack for the Bedrock demo, synthesised (no samples, no licences): pad, heartbeat, pulse, whooshes and
Bedrock's own alarm cues (web/src/lib/alarmSound.ts) placed on the video timeline (src/Video.tsx).

usage: python make_audio.py   -> public/audio/soundtrack.wav (48 kHz stereo, 120 s)
"""

import os
import wave

import numpy as np

SR = 48_000
DUR = 120.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(2026)

# Scene starts in seconds (frames / 30): hook, title, risks, ward, alarms, patient, granite, evidence, arch, end.
FRAMES = [300, 210, 390, 390, 210, 330, 600, 600, 360, 210]
STARTS = np.concatenate([[0], np.cumsum(FRAMES)[:-1]]) / 30
S = dict(zip(["hook", "title", "risks", "ward", "alarms", "patient", "granite", "evidence", "arch", "end"], STARTS))

L = np.zeros(N)
R = np.zeros(N)


def hz(note: int) -> float:
    return 440.0 * 2 ** ((note - 69) / 12)


def env(n: int, attack: float, release: float) -> np.ndarray:
    e = np.ones(n)
    a, r = int(attack * SR), int(release * SR)
    if a:
        e[:a] = np.linspace(0, 1, a)
    if r:
        e[-r:] *= np.linspace(1, 0, r)
    return e


def add(sig: np.ndarray, at: float, gain: float = 1.0, pan: float = 0.0):
    i = int(at * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    L[i : i + len(sig)] += sig * gain * (1 - pan) / 2 * 2 ** 0.5
    R[i : i + len(sig)] += sig * gain * (1 + pan) / 2 * 2 ** 0.5


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


# ---- Pad: slow chords, D minor colour, resolving to D major for the end card. ------------------------------
CHORDS = [
    (0, [50, 57, 60, 64, 65]),  # Dm9
    (S["title"], [46, 53, 57, 62, 65]),  # Bbmaj7
    (S["ward"], [41, 53, 57, 60, 64]),  # Fmaj7
    (S["alarms"], [48, 55, 60, 62, 67]),  # Csus2
    (S["patient"], [46, 53, 58, 62, 65]),  # Bb
    (S["granite"], [43, 55, 58, 62, 67]),  # Gm9
    (S["evidence"], [41, 53, 57, 60, 65]),  # F
    (S["arch"], [48, 55, 60, 64, 67]),  # C
    (S["end"], [50, 57, 62, 66, 69]),  # D major
]
for k, (start, notes) in enumerate(CHORDS):
    end = CHORDS[k + 1][0] + 1.5 if k + 1 < len(CHORDS) else DUR
    n = int((end - start) * SR)
    tt = np.arange(n) / SR
    chord = np.zeros(n)
    for j, note in enumerate(notes):
        f = hz(note)
        for det in (-0.12, 0.12):
            chord += np.sin(2 * np.pi * (f + det) * tt + j) * (0.9 if j == 0 else 0.55)
            chord += 0.18 * np.sin(2 * np.pi * 2 * (f + det) * tt)
    chord *= 0.5 + 0.5 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.07 * tt))  # slow swell
    chord *= env(n, 1.5, 1.5)
    add(chord, start, gain=0.022, pan=-0.1 if k % 2 else 0.1)

# ---- Heartbeat in the hook, in sync with the ECG (Intro.tsx beatTimes). ------------------------------------
beats, tb, k = [], 0.6, 0
while tb < 9.4:
    beats.append(tb)
    tb += max(0.5, 0.95 - 0.045 * k)
    k += 1
for i, b in enumerate(beats):
    for off, g in ((0.0, 1.0), (0.17, 0.6)):  # lub-dub
        n = int(0.25 * SR)
        tt = np.arange(n) / SR
        thump = np.sin(2 * np.pi * (55 + 40 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 18)
        add(thump, b + off, gain=0.55 * g * (0.7 + 0.03 * i))

# ---- Pulse: soft kick and tick at 100 BPM from the title to the end card. --------------------------------
bpm = 100
step = 60 / bpm
kick_n = int(0.3 * SR)
kt = np.arange(kick_n) / SR
kick = np.sin(2 * np.pi * (48 + 70 * np.exp(-kt * 40)) * kt) * np.exp(-kt * 12)
tick_n = int(0.05 * SR)
tick = np.diff(rng.standard_normal(tick_n + 1)) * np.exp(-np.arange(tick_n) / SR * 90)
pos = S["risks"]
while pos < S["end"] - 0.2:
    ramp = min(1.0, (pos - S["risks"]) / 4)
    duck = 0.35 if S["alarms"] <= pos < S["alarms"] + 3 else 1.0
    add(kick, pos, gain=0.32 * ramp * duck)
    add(tick, pos + step / 2, gain=0.05 * ramp * duck, pan=0.4)
    pos += step

# ---- Whooshes into each scene. -------------------------------------------------------------------------
wn = int(0.9 * SR)
noise = rng.standard_normal(wn)
whoosh = lowpass(noise, 1800) * np.sin(np.linspace(0, np.pi, wn)) ** 2
for name in ["title", "risks", "ward", "alarms", "patient", "granite", "evidence", "arch", "end"]:
    add(whoosh, S[name] - 0.55, gain=0.16, pan=-0.3)

# ---- Logo hits: deep boom plus shimmer, on the title and the end card. ------------------------------------
for at in (S["title"] + 36 / 30, S["end"] + 26 / 30):
    n = int(2.5 * SR)
    tt = np.arange(n) / SR
    boom = np.sin(2 * np.pi * (40 + 30 * np.exp(-tt * 8)) * tt) * np.exp(-tt * 2.2)
    shimmer = sum(np.sin(2 * np.pi * hz(m) * tt) for m in (86, 90, 93)) * np.exp(-tt * 1.6) * 0.15
    add(boom + shimmer, at, gain=0.6)

# ---- Bedrock alarm cues (same patterns as the app). --------------------------------------------------------
def alarm(freq: float, length: float, starts: list[float]) -> np.ndarray:
    total = int((starts[-1] + length + 0.1) * SR)
    out = np.zeros(total)
    n = int(length * SR)
    tt = np.arange(n) / SR
    e = env(n, 0.015, 0.04)
    p = (np.sin(2 * np.pi * freq * tt) + 0.35 * np.sin(2 * np.pi * 2 * freq * tt) + 0.18 * np.sin(2 * np.pi * 3 * freq * tt)) * e
    for s in starts:
        i = int(s * SR)
        out[i : i + n] += p
    return out


high = alarm(659, 0.14, [0, 0.2, 0.4, 0.85, 1.05])
medium = alarm(523, 0.2, [0, 0.3, 0.6])
add(high, S["alarms"] + 24 / 30, gain=0.28)
add(high, S["alarms"] + 24 / 30 + 2.4, gain=0.18)
add(medium, S["granite"] + 10 + 95 / 30, gain=0.12)

# ---- "Checked against the facts": a soft two-note chime. ----------------------------------------------------
n = int(1.6 * SR)
tt = np.arange(n) / SR
chime = (np.sin(2 * np.pi * hz(88) * tt) * np.exp(-tt * 3) + np.sin(2 * np.pi * hz(95) * np.maximum(tt - 0.12, 0)) * np.exp(-np.maximum(tt - 0.12, 0) * 3) * (tt > 0.12))
add(chime, S["granite"] + 150 / 30, gain=0.16, pan=0.2)
add(chime, S["evidence"] + 190 / 30, gain=0.12, pan=-0.2)

# ---- Master: gentle fades, normalise to -1 dBFS, write. ----------------------------------------------------
master = env(N, 0.4, 2.5)
L *= master
R *= master
peak = max(np.abs(L).max(), np.abs(R).max())
scale = 10 ** (-1 / 20) / peak
stereo = np.stack([L * scale, R * scale], axis=1)
os.makedirs(os.path.join(os.path.dirname(__file__), "public", "audio"), exist_ok=True)
path = os.path.join(os.path.dirname(__file__), "public", "audio", "soundtrack.wav")
with wave.open(path, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((stereo * 32767).astype("<i2").tobytes())
print("wrote", path, f"{DUR:.0f}s", {k: round(v, 2) for k, v in S.items()})
