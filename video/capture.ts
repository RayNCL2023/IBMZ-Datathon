// Captures real 1920x1080 (2x density) screenshots of the running Bedrock app for the demo video.
// usage: start the web app (bun run dev in ../web, live data), then: bun run capture
import puppeteer from "puppeteer-core";
import type { Page } from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const APP = process.env.APP_URL ?? "http://localhost:3000";
const OUT = join(HERE, "public", "capture");
const CHROME = process.env.CHROME_PATH ?? join(HERE, "node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe");
const SHOWCASE = { patient: "p006101", hour: 34 };

mkdirSync(OUT, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function settle(page: Page, ms = 600) {
    await page.waitForNetworkIdle({ idleTime: 700, timeout: 60_000 }).catch(() => {});
    await sleep(ms);
}

async function shot(page: Page, name: string, fullPage = false) {
    await page.screenshot({ path: join(OUT, `${name}.png`) as `${string}.png`, fullPage });
    console.log("captured", name);
}

// Scrubbing the slider (not stepping) moves the clock without raising alarm toasts.
async function setHour(page: Page, hour: number) {
    await page.evaluate((h) => {
        const el = document.querySelector<HTMLInputElement>('input[type="range"]')!;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, String(h));
        el.dispatchEvent(new Event("input", { bubbles: true }));
    }, hour);
    await settle(page);
}

async function clickText(page: Page, selector: string, text: string) {
    await page.evaluate(
        (sel, t) => {
            const el = [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.textContent?.trim().includes(t));
            if (!el) {
                throw new Error(`no ${sel} with "${t}"`);
            }
            el.click();
        },
        selector,
        text,
    );
}

async function dismissToasts(page: Page) {
    await page.evaluate(() => {
        [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.trim() === "Dismiss all")?.click();
        document.querySelectorAll<HTMLElement>('button[aria-label="Dismiss notification"]').forEach((b) => b.click());
    });
    await sleep(400);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars"] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
await page.goto(APP, { waitUntil: "networkidle0", timeout: 120_000 });
await settle(page, 1500);

// 1. The ward floor plan, hour by hour.
for (let h = 20; h <= 27; h++) {
    await setHour(page, h);
    await dismissToasts(page);
    await sleep(900);
    await shot(page, `ward-${h}`);
}

// 2. A live alarm: step forward one hour so new alarms raise their toasts.
await setHour(page, 22);
await dismissToasts(page);
await page.click('button[aria-label="Forward one hour"]');
await settle(page, 1500);
await shot(page, "ward-alarms");
await dismissToasts(page);

// 3. Retrospective labels on (settings), then the showcase patient at the hour before labelled onset.
await page.click('button[aria-label="Display and data settings"]');
await sleep(500);
await page.evaluate(() => {
    const group = document.querySelector('[role="radiogroup"][aria-label="Show retrospective labels"]');
    [...(group?.querySelectorAll<HTMLElement>("button") ?? [])].find((b) => b.textContent?.trim() === "Shown")?.click();
});
await page.keyboard.press("Escape");
await setHour(page, SHOWCASE.hour);
await dismissToasts(page);

// Side peek first (opened from the bed list), then the full page through "Open as page" (client navigation keeps the clock).
await page.click(`aside a[href="/patient/${SHOWCASE.patient}"]`);
await settle(page, 1500);
await shot(page, "peek");
await clickText(page, '[role="dialog"] a', "Open as page");
await settle(page, 2000);
await dismissToasts(page);
await shot(page, "patient-top");
await shot(page, "patient-full", true);

// Observations history: the table view, scrolled into place.
await page.evaluate(() => {
    const card = [...document.querySelectorAll("h3")].find((h) => h.textContent?.includes("Observations"))?.closest("section");
    [...(card?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])].find((b) => b.textContent?.trim() === "Table")?.click();
    card?.scrollIntoView({ block: "start" });
});
await sleep(800);
await shot(page, "observations-table");
await page.evaluate(() => {
    const card = [...document.querySelectorAll("h3")].find((h) => h.textContent?.includes("Observations"))?.closest("section");
    [...(card?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])].find((b) => b.textContent?.trim() === "Charts")?.click();
});
await sleep(500);

// 4. Granite SBAR handover for this patient (about 20 s on the VM).
await clickText(page, "button", "Write handover");
await page.waitForFunction(() => document.body.innerText.includes("Recommendation"), { timeout: 150_000 });
await sleep(800);
await page.evaluate(() => [...document.querySelectorAll("h3")].find((h) => h.textContent?.includes("Handover"))?.scrollIntoView({ block: "start" }));
await sleep(600);
await shot(page, "handover");

// 5. Granite shift summary for the ward.
await page.click('nav[aria-label="Main"] a[href="/"]');
await settle(page, 1500);
await dismissToasts(page);
await clickText(page, "button", "Shift summary");
await sleep(600);
await clickText(page, '[role="dialog"] button', "12 h").catch(() => {});
await clickText(page, '[role="dialog"] button', "Write summary");
await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.textContent?.includes("Copy summary"), { timeout: 150_000 });
await sleep(1000);
await shot(page, "shift-summary");

await browser.close();
console.log("done");
