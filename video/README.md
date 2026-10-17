# Bedrock demo video

A 2-minute product film for the IBM Z Datathon (Real-time AI for critical decisions), built with [Remotion](https://www.remotion.dev): every frame is React, so the film uses Bedrock's own tokens, font and logo. Product shots are real captures of the app running against the live LinuxONE API, and every number on screen comes from the API (`src/data.json`).

## Render

```bash
bun install
bunx remotion browser ensure
# 1. Start the web app with live data (../web: bun run dev), then capture the product shots:
bun run capture
# 2. Synthesise the soundtrack (pad, heartbeat, Bedrock's own alarm cues):
python make_audio.py
# 3. Render 1920x1080, 30 fps, 120 s:
bun run render
```

On Windows the project path can exceed Chrome's path limit; copy the headless shell somewhere short and set `CHROME_PATH` to its `chrome-headless-shell.exe` (both the capture script and `remotion.config.ts` honour it). Run the capture with Node (`bun run capture` does), not Bun.

## Structure

| File | What |
|---|---|
| `src/Video.tsx` | Scene timeline (10 scenes, 3600 frames) |
| `src/kit.tsx` | Motion kit: kinetic words, camera over captures, highlights, callouts, logo |
| `src/scenes/Intro.tsx` | Hook (ECG), title, five risks |
| `src/scenes/Product.tsx` | Ward, alarms, patient, Granite |
| `src/scenes/Proof.tsx` | Alarm-fatigue curve, AUROC, LinuxONE architecture, end card |
| `capture.ts` | Puppeteer script that captures the app |
| `make_audio.py` | Soundtrack on the same timeline |
| `review.mjs` | Renders review stills: `node review.mjs 450 1200` |
