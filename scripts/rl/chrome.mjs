/**
 * Resolve a Chromium executable for Playwright bots (no hardcoded user paths).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const VENDOR_PHASER = path.join(ROOT, 'vendor', 'phaser.min.js');

/**
 * @returns {string|undefined} path to chrome, or undefined to let Playwright pick
 */
export function resolveChromePath() {
    if (process.env.PLAYWRIGHT_CHROME && fs.existsSync(process.env.PLAYWRIGHT_CHROME)) {
        return process.env.PLAYWRIGHT_CHROME;
    }
    try {
        const p = chromium.executablePath();
        if (p && fs.existsSync(p)) return p;
    } catch {
        // Playwright browsers may not be installed yet
    }
    return undefined;
}

/**
 * Headless unless HEADLESS=0. Headed Chromium steals desktop focus.
 */
export function defaultHeadless() {
    return process.env.HEADLESS !== '0';
}

/**
 * Bot/RL clock vs wall time. Humans stay at 1x. Override with TIMESCALE=1.
 */
export function defaultPlaytestTimeScale() {
    const n = Number(process.env.TIMESCALE);
    if (Number.isFinite(n) && n > 0) return Math.min(16, n);
    return 8;
}

export function appendPlaytestTimeScale(url) {
    if (!url.searchParams.has('timescale')) {
        url.searchParams.set('timescale', String(defaultPlaytestTimeScale()));
    }
    return url;
}

/**
 * @returns {import('playwright').LaunchOptions}
 */
export function defaultLaunchOptions(headless) {
    const opts = {
        headless: Boolean(headless),
        args: [
            '--use-gl=swiftshader',
            '--ignore-gpu-blocklist',
            '--no-sandbox',
            '--autoplay-policy=no-user-gesture-required'
        ]
    };
    const chrome = resolveChromePath();
    if (chrome) opts.executablePath = chrome;
    return opts;
}

/**
 * Serve the vendored Phaser locally instead of the jsDelivr CDN.
 * Thin-CDN / offline dev boxes can take 10s+ to fetch the 1MB file and the
 * page boot watchdog fires before Phaser arrives. Falls back to the real
 * CDN when vendor/phaser.min.js is absent.
 */
export async function routeVendorPhaser(page) {
    if (!fs.existsSync(VENDOR_PHASER)) return false;
    await page.route('https://cdn.jsdelivr.net/npm/phaser@3.55.2/dist/phaser.min.js', async (route) => {
        await route.fulfill({ path: VENDOR_PHASER, contentType: 'application/javascript' });
    });
    return true;
}
