// Renders review stills: node review.mjs 200 1250 ...
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";

const frames = process.argv.slice(2).map(Number);
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const browserExecutable = process.env.CHROME_PATH;
const composition = await selectComposition({ serveUrl, id: "Bedrock", browserExecutable });
for (const frame of frames) {
    await renderStill({ composition, serveUrl, frame, output: `out/review/f${String(frame).padStart(4, "0")}.png`, browserExecutable, scale: 0.5 });
    console.log("still", frame);
}
