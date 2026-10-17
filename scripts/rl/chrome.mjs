/**
 * Resolve a Chromium executable for Playwright bots (no hardcoded user paths).
 */
import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
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
    // HEADLESS_SHELL=1 checks the shell cache before the pinned full build.
    if (process.env.HEADLESS_SHELL === '1') {
        const shell = probePlaywrightCache(true);
        if (shell) return shell;
    }
    try {
        const p = chromium.executablePath();
        if (p && fs.existsSync(p)) return p;
    } catch {
        // Playwright browsers may not be installed yet
    }
    // The pinned playwright revision is often absent while a working binary
    // sits in the cache: probe for any chromium revision, newest first,
    // full chrome before headless shell.
    return probePlaywrightCache(false);
}

function probePlaywrightCache(shellFirst) {
    let entries = [];
    try {
        entries = fs.readdirSync(path.join(os.homedir(), '.cache', 'ms-playwright'), { withFileTypes: true });
    } catch {
        return undefined;
    }
    const revisionOf = (name) => {
        const match = /-(\d+)$/.exec(name);
        return match ? Number(match[1]) : -1;
    };
    const dirs = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => revisionOf(b) - revisionOf(a));
    const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
    const full = [
        ['chrome-linux', 'chrome'],
        ['chrome-linux64', 'chrome']
    ];
    const shell = [
        ['chrome-linux', 'headless_shell'],
        ['chrome-headless-shell-linux64', 'chrome-headless-shell']
    ];
    // Shell-first callers want the lighter binary: faster startup and less
    // memory per worker, ideal for high-parallelism RL recording. Each
    // class sweeps every cached revision (newest first) before the other
    // class is considered.
    const phases = shellFirst ? [shell, full] : [full, shell];
    for (const layouts of phases) {
        for (const dir of dirs) {
            if (!dir.startsWith('chromium')) continue;
            for (const [folder, binary] of layouts) {
                const candidate = path.join(cache, dir, folder, binary);
                if (fs.existsSync(candidate)) return candidate;
            }
        }
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
            '--mute-audio',
            '--autoplay-policy=no-user-gesture-required'
        ]
    };
    const chrome = resolveChromePath();
    if (chrome) opts.executablePath = chrome;
    return opts;
}

const WIN_CHROME = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';
const WIN_CSC = '/mnt/c/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe';
const WIN_POWERSHELL = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
const RELAY_CS = `using System;
using System.Net;
using System.Net.Sockets;
using System.Threading.Tasks;
public class Relay {
    public static void Main(string[] args) {
        var listener = new TcpListener(IPAddress.Parse(args[0]), int.Parse(args[1]));
        listener.Start();
        Console.WriteLine("RELAY_UP");
        while (true) {
            var incoming = listener.AcceptTcpClient();
            int upstream = int.Parse(args[2]);
            Task.Run(() => Pipe(incoming, upstream));
        }
    }
    static void Pipe(TcpClient incoming, int upstream) {
        try {
            using (incoming)
            using (var remote = new TcpClient()) {
                remote.Connect("127.0.0.1", upstream);
                var a = incoming.GetStream();
                var b = remote.GetStream();
                var t1 = Task.Run(() => Copy(a, b));
                var t2 = Task.Run(() => Copy(b, a));
                Task.WaitAny(t1, t2);
            }
        } catch { }
    }
    static void Copy(NetworkStream src, NetworkStream dst) {
        try { src.CopyTo(dst); } catch { }
        try { dst.Close(); } catch { }
    }
}
`;

function wslHostIp() {
    try {
        const match = fs.readFileSync('/etc/resolv.conf', 'utf8').match(/nameserver\s+(\S+)/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

function windowsChromePath() {
    if (process.env.NOVAWING_SWIFTSHADER === '1') return null;
    const fromEnv = process.env.NOVAWING_WIN_CHROME;
    if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
    if (fs.existsSync(WIN_CHROME) && fs.existsSync(WIN_CSC)) return WIN_CHROME;
    return null;
}

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
        req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function run(file, args) {
    const child = spawn(file, args, { stdio: 'ignore' });
    child.on('error', (error) => console.error(`[browser] ${path.basename(file)}: ${error.message}`));
    return child;
}

function killToken(token) {
    return new Promise((resolve) => {
        if (!fs.existsSync(WIN_POWERSHELL)) {
            resolve();
            return;
        }
        const child = spawn(WIN_POWERSHELL, ['-NoProfile', '-Command',
            `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${token}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`]);
        const timer = setTimeout(() => resolve(), 8000);
        const done = () => { clearTimeout(timer); resolve(); };
        child.on('exit', done);
        child.on('error', done);
    });
}

async function stopWindowsChrome(token, children = []) {
    for (const child of children) {
        try { child.kill(); } catch { /* already gone */ }
    }
    await killToken(token);
    try {
        fs.rmSync(`/mnt/c/Users/Public/novawing-${token}`, { recursive: true, force: true });
    } catch {
        // Windows can keep the profile locked for a moment after the process exits.
    }
}

async function ensureRelay() {
    const exe = '/mnt/c/Users/Public/novawing-cdp-relay.exe';
    const cs = '/mnt/c/Users/Public/novawing-cdp-relay.cs';
    if (!fs.existsSync(exe)) {
        fs.mkdirSync('/mnt/c/Users/Public', { recursive: true });
        fs.writeFileSync(cs, RELAY_CS);
        await new Promise((resolve, reject) => {
            const child = spawn(WIN_CSC, ['/nologo', '/out:C:\\Users\\Public\\novawing-cdp-relay.exe', 'C:\\Users\\Public\\novawing-cdp-relay.cs'], { stdio: 'ignore' });
            child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`csc exited ${code}`)));
            child.on('error', reject);
        });
    }
    return exe;
}

/**
 * Linux Chromium's EGL path crashes in WSL's libd3d12core, so headless WebGL
 * falls back to SwiftShader (~180ms/frame). Windows Chrome on this host renders
 * with the Radeon (~16ms/frame). Its DevTools port is loopback-only, which WSL
 * cannot dial, so a small relay on the Windows vNIC forwards it.
 * Set NOVAWING_SWIFTSHADER=1 to keep the Linux browser.
 * @returns {Promise<import('playwright').Browser|null>}
 */
async function tryWindowsChrome(chromium, headless, slowMo = 0) {
    const chromePath = windowsChromePath();
    const host = wslHostIp();
    if (!chromePath || !host) {
        console.error('winchrome skip', Boolean(chromePath), host);
        return null;
    }
    const token = `nwcdp${process.pid}x${Date.now()}`;
    const chromePort = 20000 + Math.floor(Math.random() * 20000);
    const relayPort = chromePort + 1;
    const profile = `C:\\Users\\Public\\novawing-${token}`;
    let relayExe;
    try {
        relayExe = await ensureRelay();
    } catch (error) {
        console.error('winchrome relay', error);
        return null;
    }
    const args = [
        '--use-angle=d3d11',
        '--ignore-gpu-blocklist',
        '--enable-gpu',
        '--disable-gpu-vsync',
        '--disable-frame-rate-limit',
        '--no-first-run',
        '--disable-extensions',
        '--mute-audio',
        '--autoplay-policy=no-user-gesture-required',
        `--remote-debugging-port=${chromePort}`,
        `--user-data-dir=${profile}`,
        'about:blank'
    ];
    if (headless) args.unshift('--headless=new');
    const chromeChild = run(chromePath, args);
    const relayChild = run(relayExe, [host, String(relayPort), String(chromePort), token]);
    const endpoint = `http://${host}:${relayPort}`;
    const deadline = Date.now() + 15000;
    let up = false;
    while (Date.now() < deadline) {
        try {
            const res = await httpGet(`${endpoint}/json/version`);
            if (res.status === 200 && res.body.includes('Browser')) {
                up = true;
                break;
            }
        } catch {
            // Chrome or the relay is still starting.
        }
        await new Promise((r) => setTimeout(r, 200));
    }
    const children = [chromeChild, relayChild];
    if (!up) {
        console.error('winchrome down', endpoint, token);
        await stopWindowsChrome(token, children);
        return null;
    }
    try {
        const browser = await chromium.connectOverCDP(endpoint, { slowMo });
        const close = browser.close.bind(browser);
        browser.close = async () => {
            try { await close(); } catch { /* already disconnected */ }
            await stopWindowsChrome(token, children);
        };
        return browser;
    } catch (error) {
        console.error('winchrome cdp', error);
        await stopWindowsChrome(token, children);
        return null;
    }
}

/**
 * @param {typeof chromium} chromium
 * @param {boolean} headless
 */
export async function launchBrowser(chromium, headless, { slowMo = 0, recordVideo = false } = {}) {
    if (!recordVideo && windowsChromePath()) {
        const windows = await tryWindowsChrome(chromium, headless, slowMo);
        if (!windows) {
            throw new Error('Windows GPU browser failed to start. Set NOVAWING_SWIFTSHADER=1 to explicitly allow slow software rendering.');
        }
        try {
            const page = await windows.contexts()[0].newPage();
            const renderer = await page.evaluate(() => {
                const gl = document.createElement('canvas').getContext('webgl');
                const ext = gl?.getExtension('WEBGL_debug_renderer_info');
                return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
            });
            await page.close();
            if (!renderer || /swiftshader|llvmpipe|software|basic render/i.test(renderer)) {
                throw new Error(`Hardware WebGL unavailable: ${renderer || 'no renderer'}`);
            }
            console.log(`[browser] Windows GPU: ${renderer}`);
            return windows;
        } catch (error) {
            await windows.close();
            throw error;
        }
    }
    console.warn(`[browser] Linux software rendering${recordVideo ? ' (RECORD_VIDEO=1; use RECORD_VIDEO=0 for the Windows GPU)' : ''}`);
    return chromium.launch({ ...defaultLaunchOptions(headless), slowMo });
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
