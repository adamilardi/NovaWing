#!/usr/bin/env node
/**
 * Neon Reef (Level 17) art baker — dependency-free procedural raster art.
 *
 * Paints every new Level 17 asset with real alpha and writes it under assets/:
 *   assets/levels/neon-reef.png            1600x900  opaque background-far
 *   assets/levels/reef-scenery.png          1280x720  alpha mid silhouettes
 *   assets/levels/terrain/reef-wall.png      512x512  dense solid block
 *   assets/levels/terrain/reef-arch.png      512x256  dense solid beam
 *   assets/levels/terrain/reef-pylon.png     256x512  dense solid pylon
 *   assets/levels/terrain/reef-bloom.png     256x256  alpha drifting decor
 *   assets/bosses/neon-choir.png             640x400  alpha boss, faces left
 *   assets/enemy-reef-skimmer.png            240x140  alpha enemy, faces left
 *   assets/enemy-reef-angler.png             280x180  alpha enemy, faces left
 *   assets/powerup-torrent.png               128x128  alpha orb
 *   assets/powerup-phase.png                 128x128  alpha orb
 *
 * Run: node art-candidates/neon-reef/bake-reef-art.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// ---------------------------------------------------------------------------
// Seeded RNG (deterministic output)
// ---------------------------------------------------------------------------
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---------------------------------------------------------------------------
// Minimal PNG writer (RGBA8, non-interlaced) — no dependencies.
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
    }
    return table;
})();
function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 4, 'ascii');
    Buffer.from(data).copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)])), 8 + data.length);
    return out;
}
function writePng(file, w, h, rgba) {
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (w * 4 + 1)] = 0; // filter: None
        Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4)
            .copy(raw, y * (w * 4 + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const png = Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, png);
    return png.length;
}

// ---------------------------------------------------------------------------
// Tiny software canvas (source-over blending, top-left origin)
// ---------------------------------------------------------------------------
function canvas(w, h) {
    return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}
function blendPixel(c, x, y, r, g, b, a) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= c.w || y >= c.h || a <= 0) return;
    const i = (y * c.w + x) * 4;
    const sa = a / 255;
    const da = c.data[i + 3] / 255;
    const out = sa + da * (1 - sa);
    if (out <= 0) { c.data[i + 3] = 0; return; }
    c.data[i] = Math.round((r * sa + c.data[i] * da * (1 - sa)) / out);
    c.data[i + 1] = Math.round((g * sa + c.data[i + 1] * da * (1 - sa)) / out);
    c.data[i + 2] = Math.round((b * sa + c.data[i + 2] * da * (1 - sa)) / out);
    c.data[i + 3] = Math.round(out * 255);
}
function fillRect(c, x0, y0, x1, y1, col) {
    const [r, g, b, a] = col;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(c.h, Math.ceil(y1)); y++) {
        for (let x = Math.max(0, Math.floor(x0)); x < Math.min(c.w, Math.ceil(x1)); x++) {
            blendPixel(c, x, y, r, g, b, a);
        }
    }
}
function lerp(a, b, t) { return a + (b - a) * t; }
function mixCol(A, B, t) {
    return [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t), lerp(A[3], B[3], t)];
}
/** Vertical gradient fill over a rect. stops: [[t, [r,g,b,a]], ...] sorted. */
function vgrad(c, x0, y0, x1, y1, stops) {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(c.h, Math.ceil(y1)); y++) {
        const t = (y - y0) / Math.max(1, y1 - y0 - 1);
        let s = 0;
        while (s < stops.length - 2 && t > stops[s + 1][0]) s++;
        const [t0, c0] = stops[s];
        const [t1, c1] = stops[s + 1];
        const k = Math.min(1, Math.max(0, (t - t0) / Math.max(1e-6, t1 - t0)));
        const col = mixCol(c0, c1, k);
        for (let x = Math.max(0, Math.floor(x0)); x < Math.min(c.w, Math.ceil(x1)); x++) {
            blendPixel(c, x, y, col[0], col[1], col[2], col[3]);
        }
    }
}
function circle(c, cx, cy, r, col, soft = 0) {
    const [cr, cg, cb, ca] = col;
    const R = Math.ceil(r + soft);
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
        for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
            const d = Math.hypot(x - cx, y - cy);
            let a = ca;
            if (d > r) {
                if (soft <= 0 || d > r + soft) continue;
                a = ca * (1 - (d - r) / soft);
            }
            blendPixel(c, x, y, cr, cg, cb, a);
        }
    }
}
/** Rotated ellipse fill via parametric polygon. rot in radians. */
function blob(c, cx, cy, rx, ry, rot, col, n = 28) {
    const pts = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const ex = Math.cos(a) * rx;
        const ey = Math.sin(a) * ry;
        pts.push([cx + ex * Math.cos(rot) - ey * Math.sin(rot), cy + ex * Math.sin(rot) + ey * Math.cos(rot)]);
    }
    poly(c, pts, col);
}
function poly(c, pts, col) {
    const [r, g, b, a] = col;
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.max(0, Math.floor(minY)); y < Math.min(c.h, Math.ceil(maxY)); y++) {
        const xs = [];
        for (let i = 0; i < pts.length; i++) {
            const [x0, y0] = pts[i];
            const [x1, y1] = pts[(i + 1) % pts.length];
            if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
                xs.push(x0 + (y - y0) / (y1 - y0) * (x1 - x0));
            }
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
            for (let x = Math.max(0, Math.ceil(xs[k])); x < Math.min(c.w, xs[k + 1]); x++) {
                blendPixel(c, x, y, r, g, b, a);
            }
        }
    }
}
function line(c, x0, y0, x1, y1, width, col) {
    const [r, g, b, a] = col;
    const len = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
    const steps = Math.ceil(len);
    const rad = width / 2;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = lerp(x0, x1, t), y = lerp(y0, y1, t);
        for (let oy = -Math.ceil(rad); oy <= Math.ceil(rad); oy++) {
            for (let ox = -Math.ceil(rad); ox <= Math.ceil(rad); ox++) {
                if (Math.hypot(ox, oy) <= rad) blendPixel(c, x + ox, y + oy, r, g, b, a);
            }
        }
    }
}
/** Radial glow: bright core fading to transparent halo. */
function glowDot(c, cx, cy, r, core, halo) {
    const steps = 10;
    for (let i = steps; i >= 1; i--) {
        const t = i / steps;
        const col = mixCol(core, halo, t);
        col[3] *= (1 - t * 0.82);
        circle(c, cx, cy, r * t, col);
    }
    circle(c, cx, cy, Math.max(1, r * 0.22), core);
}
function speckle(c, rng, n, x0, y0, x1, y1, cols, sMin, sMax, aMin, aMax) {
    for (let i = 0; i < n; i++) {
        const col = cols[Math.floor(rng() * cols.length)];
        const s = sMin + rng() * (sMax - sMin);
        circle(c, lerp(x0, x1, rng()), lerp(y0, y1, rng()), s,
            [col[0], col[1], col[2], aMin + rng() * (aMax - aMin)], 1);
    }
}
function vignette(c, strength) {
    const cx = c.w / 2, cy = c.h / 2;
    const maxD = Math.hypot(cx, cy);
    for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
            const t = Math.hypot(x - cx, y - cy) / maxD;
            const a = Math.pow(Math.max(0, t - 0.42) / 0.58, 1.6) * 255 * strength;
            if (a > 1) blendPixel(c, x, y, 2, 3, 8, a);
        }
    }
}
/** Recursive coral branch. Returns tip positions for polyp glow. */
function coral(c, rng, x, y, angle, len, width, col, depth, tips) {
    const nx = x + Math.cos(angle) * len;
    const ny = y + Math.sin(angle) * len;
    line(c, x, y, nx, ny, width, col);
    if (depth <= 0) { tips.push([nx, ny]); return; }
    const branches = 2 + (rng() < 0.4 ? 1 : 0);
    for (let i = 0; i < branches; i++) {
        coral(c, rng, nx, ny, angle + (rng() - 0.5) * 1.5, len * (0.55 + rng() * 0.25),
            Math.max(1, width * 0.62), col, depth - 1, tips);
    }
}

// Palette — Neon Reef: deep indigo water, teal + magenta bioluminescence.
const PAL = {
    deepTop: [13, 20, 52, 255],
    deepMid: [7, 15, 34, 255],
    deepBot: [3, 6, 14, 255],
    rock: [20, 28, 51, 255],
    rockHi: [42, 56, 92, 255],
    rockLo: [10, 14, 30, 255],
    hull: [22, 32, 58, 255],
    hullHi: [58, 76, 120, 255],
    hullLo: [10, 15, 32, 255],
    teal: [46, 230, 200, 255],
    tealSoft: [125, 255, 234, 255],
    magenta: [255, 79, 216, 255],
    violet: [197, 106, 255, 255],
    amber: [255, 178, 77, 255],
    bone: [223, 233, 255, 255],
    silhou: [10, 17, 38, 255]
};

// ---------------------------------------------------------------------------
// Background-far: sunken neon reef + flooded data ruins (opaque, quiet center)
// ---------------------------------------------------------------------------
function paintBackground() {
    const W = 1600, H = 900;
    const c = canvas(W, H);
    const rng = mulberry32(1717);
    vgrad(c, 0, 0, W, H, [[0, PAL.deepTop], [0.55, PAL.deepMid], [1, PAL.deepBot]]);
    // God rays from the surface.
    for (const [x, w, a] of [[180, 90, 14], [520, 150, 10], [1010, 110, 13], [1330, 190, 9]]) {
        poly(c, [[x, -20], [x + w, -20], [x + w - 260, H], [x - 260, H]], [120, 220, 255, a]);
    }
    // Distant reef band: layered sine silhouettes, darker than water above.
    for (const [baseY, amp, col] of [[600, 46, [11, 22, 48, 255]], [660, 60, [8, 16, 36, 255]], [730, 70, [5, 10, 24, 255]]]) {
        const pts = [[-20, H]];
        for (let x = -20; x <= W + 20; x += 40) {
            pts.push([x, baseY + Math.sin(x * 0.008 + baseY) * amp + Math.sin(x * 0.021) * amp * 0.35]);
        }
        pts.push([W + 20, H]);
        poly(c, pts, col);
    }
    // Drowned server pylons on the horizon.
    for (const [x, w, h] of [[240, 46, 190], [700, 60, 240], [1180, 52, 210], [1450, 40, 170]]) {
        fillRect(c, x, 640 - h, x + w, 640, [13, 24, 50, 255]);
        fillRect(c, x, 640 - h, x + 4, 640, [60, 90, 140, 200]);
        for (let yy = 650 - h; yy < 620; yy += 26) {
            const on = rng() < 0.6;
            fillRect(c, x + 8, yy, x + w - 8, yy + 5,
                on ? [46, 230, 200, 150] : [255, 79, 216, 120]);
        }
    }
    // Coral clusters hug the frame edges so the center stays readable.
    const tips = [];
    const clusters = [[60, 830, -1.2], [220, 860, -1.4], [1420, 850, -1.7], [1560, 800, -1.9],
        [80, 120, 0.5], [1540, 100, 2.6]];
    for (const [x, y, a] of clusters) {
        for (let b = 0; b < 4; b++) {
            coral(c, rng, x, y, a + (rng() - 0.5) * 0.9, 70 + rng() * 60, 7, [18, 32, 62, 255], 3, tips);
        }
    }
    // Polyp glow on a subset of tips.
    for (const [x, y] of tips) {
        if (rng() < 0.45) glowDot(c, x, y, 5 + rng() * 7,
            rng() < 0.6 ? PAL.teal : PAL.magenta, [20, 40, 80, 255]);
    }
    // Drifting motes + faint current streaks.
    speckle(c, rng, 260, 0, 0, W, H, [PAL.tealSoft, PAL.bone, PAL.violet], 1, 3, 40, 150);
    for (let i = 0; i < 14; i++) {
        const y = rng() * H;
        line(c, rng() * W, y, rng() * W + 120, y + (rng() - 0.5) * 10, 1, [120, 200, 255, 10]);
    }
    vignette(c, 0.5);
    return c;
}

// ---------------------------------------------------------------------------
// Scenery mid-layer: dark arches + reef floor with alpha (transparent middle)
// ---------------------------------------------------------------------------
function paintScenery() {
    const W = 1280, H = 720;
    const c = canvas(W, H);
    const rng = mulberry32(1718);
    // Top arch silhouettes.
    for (const [cx, cy, r, wdt] of [[240, -40, 300, 54], [880, -90, 360, 64], [1330, -30, 260, 48]]) {
        for (let a = 0.15; a < Math.PI - 0.15; a += 0.02) {
            const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.62;
            circle(c, x, y, wdt / 2, [10, 17, 38, 235]);
        }
        for (let a = 0.3; a < Math.PI - 0.3; a += 0.09) { // rim polyps
            if (rng() < 0.5) continue;
            const x = cx + Math.cos(a) * (r - wdt / 2), y = cy + Math.sin(a) * (r - wdt / 2) * 0.62;
            glowDot(c, x, y, 4 + rng() * 5, rng() < 0.5 ? PAL.teal : PAL.magenta, [16, 30, 60, 255]);
        }
    }
    // Reef floor: jagged dark mass along the bottom.
    const floor = [[-20, H + 20]];
    for (let x = -20; x <= W + 20; x += 36) {
        floor.push([x, 600 + Math.sin(x * 0.02) * 34 + rng() * 22]);
    }
    floor.push([W + 20, H + 20]);
    poly(c, floor, [9, 15, 33, 240]);
    // Coral tufts on the floor.
    const tips = [];
    for (let i = 0; i < 10; i++) {
        const x = 40 + i * 130 + rng() * 60;
        coral(c, rng, x, 660, -Math.PI / 2 + (rng() - 0.5) * 0.7, 46 + rng() * 40, 6, [14, 26, 52, 240], 3, tips);
    }
    for (const [x, y] of tips) {
        if (rng() < 0.5) glowDot(c, x, y, 4 + rng() * 6, rng() < 0.55 ? PAL.teal : PAL.violet, [14, 26, 52, 255]);
    }
    // Side pylon ruins.
    for (const [x, w, top] of [[30, 64, 330], [1190, 58, 360]]) {
        fillRect(c, x, top, x + w, 640, [11, 20, 42, 230]);
        fillRect(c, x, top, x + 5, 640, [70, 100, 150, 160]);
        for (let yy = top + 18; yy < 610; yy += 30) {
            fillRect(c, x + 10, yy, x + w - 10, yy + 6, (yy / 30 | 0) % 2 ? [46, 230, 200, 170] : [255, 79, 216, 150]);
        }
    }
    // Fade the band edges toward the transparent middle so it never reads solid.
    for (let y = 0; y < c.h; y++) {
        let keep = 1;
        if (y > 200 && y < 420) keep = 0.25 + 0.75 * Math.min(y - 200, 420 - y) / 110 * 0.5;
        if (keep >= 1) continue;
        for (let x = 0; x < c.w; x++) {
            const i = (y * c.w + x) * 4 + 3;
            c.data[i] = Math.round(c.data[i] * Math.max(0.12, keep));
        }
    }
    return c;
}

// ---------------------------------------------------------------------------
// Terrain solids: dense, full-bleed rectangles (honest rectangular physics)
// ---------------------------------------------------------------------------
function rockBase(c, rng) {
    fillRect(c, 0, 0, c.w, c.h, PAL.rock);
    speckle(c, rng, Math.round(c.w * c.h / 260), 0, 0, c.w, c.h,
        [PAL.rockHi, PAL.rockLo, [26, 38, 70, 255]], 1, 4, 60, 150);
}
function panelGrid(c, cols, rows, gap, light) {
    const cw = c.w / cols, ch = c.h / rows;
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            const x0 = i * cw + gap, y0 = j * ch + gap;
            fillRect(c, x0, y0, (i + 1) * cw - gap, y0 + 2, [58, 76, 120, 160]);
            if (light && ((i * 7 + j * 3) % 4 === 0)) {
                fillRect(c, x0 + 6, y0 + 8, x0 + cw * 0.4, y0 + 12, (i + j) % 2 ? [46, 230, 200, 220] : [255, 79, 216, 200]);
            }
        }
    }
    // Panel gaps.
    for (let i = 1; i < cols; i++) fillRect(c, i * cw - 2, 0, i * cw + 2, c.h, [6, 9, 20, 255]);
    for (let j = 1; j < rows; j++) fillRect(c, 0, j * ch - 2, c.w, j * ch + 2, [6, 9, 20, 255]);
}
function coralVeins(c, rng, n, horizontal) {
    for (let i = 0; i < n; i++) {
        let x = rng() * c.w, y = horizontal ? (rng() < 0.5 ? 0 : c.h) : (rng() < 0.5 ? 0 : c.w);
        if (!horizontal) { const t = x; x = y; y = t; }
        let angle = horizontal ? (y === 0 ? Math.PI / 2 : -Math.PI / 2) : (x === 0 ? 0 : Math.PI);
        angle += (rng() - 0.5) * 0.8;
        const tips = [];
        coral(c, rng, x, y, angle, 40 + rng() * 50, 6, [24, 44, 84, 255], 3, tips);
        for (const [tx, ty] of tips) {
            if (rng() < 0.6) glowDot(c, tx, ty, 4 + rng() * 5, rng() < 0.6 ? PAL.teal : PAL.magenta, [20, 40, 80, 255]);
        }
    }
}
function edgeSeam(c, color, inset = 0) {
    const t = 3;
    fillRect(c, inset, inset, c.w - inset, inset + t, color);
    fillRect(c, inset, c.h - inset - t, c.w - inset, c.h - inset, color);
    fillRect(c, inset, inset, inset + t, c.h - inset, color);
    fillRect(c, c.w - inset - t, inset, c.w - inset, c.h - inset, color);
}
function paintReefWall() {
    const c = canvas(512, 512);
    const rng = mulberry32(1719);
    rockBase(c, rng);
    panelGrid(c, 4, 4, 5, true);
    coralVeins(c, rng, 7, true);
    coralVeins(c, rng, 5, false);
    edgeSeam(c, [46, 230, 200, 190], 4);
    return c;
}
function paintReefArch() {
    const c = canvas(512, 256);
    const rng = mulberry32(1720);
    rockBase(c, rng);
    panelGrid(c, 4, 2, 5, true);
    coralVeins(c, rng, 5, true);
    // Heavy coral overgrowth along the top edge.
    const tips = [];
    for (let x = 20; x < c.w; x += 46) {
        coral(c, rng, x, 8, Math.PI / 2 + (rng() - 0.5) * 0.6, 40 + rng() * 36, 6, [24, 44, 84, 255], 3, tips);
    }
    for (const [x, y] of tips) {
        if (rng() < 0.55) glowDot(c, x, y, 4 + rng() * 5, rng() < 0.6 ? PAL.teal : PAL.magenta, [20, 40, 80, 255]);
    }
    edgeSeam(c, [125, 255, 234, 190], 3);
    return c;
}
function paintReefPylon() {
    const c = canvas(256, 512);
    const rng = mulberry32(1721);
    rockBase(c, rng);
    panelGrid(c, 2, 6, 4, false);
    // Twin server light strips down the middle.
    fillRect(c, 96, 10, 112, c.h - 10, [8, 12, 26, 255]);
    fillRect(c, 144, 10, 160, c.h - 10, [8, 12, 26, 255]);
    for (let y = 16; y < c.h - 20; y += 22) {
        fillRect(c, 98, y, 110, y + 10, (y / 22 | 0) % 3 === 0 ? [255, 79, 216, 230] : [46, 230, 200, 230]);
        fillRect(c, 146, y + 8, 158, y + 18, (y / 22 | 0) % 3 === 1 ? [46, 230, 200, 230] : [197, 106, 255, 220]);
    }
    coralVeins(c, rng, 4, false);
    edgeSeam(c, [255, 79, 216, 170], 3);
    return c;
}
/** Drifting decor bloom (transparent surround — decor only, never solid). */
function paintReefBloom() {
    const c = canvas(256, 256);
    const rng = mulberry32(1722);
    const cx = 128, cy = 128;
    for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + rng() * 0.2;
        blob(c, cx + Math.cos(a) * 52, cy + Math.sin(a) * 52, 46, 20, a,
            i % 2 ? [150, 60, 190, 235] : [30, 150, 160, 235]);
        blob(c, cx + Math.cos(a) * 52, cy + Math.sin(a) * 52, 30, 11, a,
            i % 2 ? [255, 79, 216, 160] : [125, 255, 234, 160]);
    }
    glowDot(c, cx, cy, 34, PAL.tealSoft, [30, 120, 130, 255]);
    circle(c, cx, cy, 12, [10, 25, 35, 255]);
    circle(c, cx, cy, 6, PAL.teal);
    return c;
}

// ---------------------------------------------------------------------------
// Enemies (side view, nose LEFT). Dense hulls, transparent margins.
// ---------------------------------------------------------------------------
function paintSkimmer() {
    const c = canvas(240, 140);
    const rng = mulberry32(1723);
    const cy = 70;
    // Swept fins (behind hull).
    poly(c, [[120, cy - 22], [196, cy - 58], [204, cy - 52], [150, cy - 14]], [26, 40, 78, 255]);
    poly(c, [[120, cy + 22], [196, cy + 58], [204, cy + 52], [150, cy + 14]], [26, 40, 78, 255]);
    line(c, 128, cy - 24, 196, cy - 56, 2, [255, 79, 216, 220]);
    line(c, 128, cy + 24, 196, cy + 56, 2, [255, 79, 216, 220]);
    // Dart hull.
    poly(c, [[10, cy], [110, cy - 30], [196, cy - 16], [218, cy], [196, cy + 16], [110, cy + 30]], PAL.hull);
    poly(c, [[10, cy], [110, cy - 30], [196, cy - 16], [120, cy - 6]], [38, 54, 96, 255]); // top light
    poly(c, [[10, cy], [110, cy + 30], [196, cy + 16], [120, cy + 6]], PAL.hullLo); // belly shade
    line(c, 14, cy - 3, 190, cy - 15, 1, [90, 120, 180, 140]);
    // Canopy.
    blob(c, 96, cy - 8, 26, 11, -0.08, [12, 50, 60, 255]);
    blob(c, 92, cy - 10, 15, 6, -0.08, [125, 255, 234, 255]);
    // Nose gun.
    fillRect(c, 4, cy - 4, 26, cy + 4, [12, 18, 36, 255]);
    glowDot(c, 6, cy, 6, PAL.teal, [20, 60, 70, 255]);
    // Engine glow at the tail.
    glowDot(c, 220, cy, 12, PAL.magenta, [80, 30, 90, 255]);
    poly(c, [[214, cy - 6], [214, cy + 6], [196, cy]], [20, 10, 30, 255]);
    // Hull greebles.
    for (let i = 0; i < 5; i++) {
        fillRect(c, 120 + i * 13, cy - 12, 128 + i * 13, cy - 8, [46, 230, 200, 170]);
    }
    speckle(c, rng, 40, 30, cy - 24, 200, cy + 24, [[60, 80, 130, 255]], 1, 2, 60, 120);
    return c;
}
function paintAngler() {
    const c = canvas(280, 180);
    const rng = mulberry32(1724);
    const cx = 140, cy = 96;
    // Tail fork (behind body).
    poly(c, [[cx + 70, cy - 20], [cx + 128, cy - 58], [cx + 120, cy - 30], [cx + 112, cy - 12]], [26, 40, 78, 255]);
    poly(c, [[cx + 70, cy + 20], [cx + 128, cy + 58], [cx + 120, cy + 30], [cx + 112, cy + 12]], [26, 40, 78, 255]);
    line(c, cx + 74, cy - 20, cx + 124, cy - 54, 2, [46, 230, 200, 200]);
    line(c, cx + 74, cy + 20, cx + 124, cy + 54, 2, [46, 230, 200, 200]);
    // Bulky hull.
    blob(c, cx, cy, 112, 60, 0, PAL.hull, 36);
    blob(c, cx - 8, cy - 14, 88, 40, -0.06, [38, 54, 96, 255], 32);
    // Jaw with teeth (front-left, lower).
    poly(c, [[cx - 112, cy + 6], [cx - 40, cy + 2], [cx - 44, cy + 34], [cx - 104, cy + 40]], [8, 12, 26, 255]);
    for (let i = 0; i < 6; i++) {
        const tx = cx - 104 + i * 11;
        poly(c, [[tx, cy + 6], [tx + 7, cy + 6], [tx + 3, cy + 20]], [223, 233, 255, 240]);
    }
    // Dorsal fin.
    poly(c, [[cx - 10, cy - 56], [cx + 40, cy - 56], [cx + 52, cy - 92], [cx + 6, cy - 60]], [26, 40, 78, 255]);
    line(c, cx, cy - 58, cx + 48, cy - 88, 2, [255, 79, 216, 210]);
    // Eye + portholes.
    glowDot(c, cx - 78, cy - 18, 10, PAL.magenta, [90, 30, 100, 255]);
    circle(c, cx - 78, cy - 18, 4, [20, 8, 26, 255]);
    for (let i = 0; i < 4; i++) {
        glowDot(c, cx - 20 + i * 26, cy + 8, 5, PAL.teal, [20, 60, 70, 255]);
    }
    // Lure stalk arcing over the nose with a glowing bulb.
    line(c, cx - 60, cy - 52, cx - 96, cy - 84, 3, [30, 48, 90, 255]);
    line(c, cx - 96, cy - 84, cx - 128, cy - 66, 3, [30, 48, 90, 255]);
    glowDot(c, cx - 130, cy - 62, 11, PAL.tealSoft, [30, 120, 130, 255]);
    // Belly seam.
    line(c, cx - 90, cy + 44, cx + 80, cy + 44, 2, [46, 230, 200, 170]);
    glowDot(c, cx + 108, cy, 9, [120, 160, 255, 255], [40, 60, 120, 255]); // engine
    speckle(c, rng, 60, cx - 100, cy - 50, cx + 100, cy + 50, [[60, 80, 130, 255]], 1, 2, 50, 110);
    return c;
}

// ---------------------------------------------------------------------------
// Boss: NEON CHOIR — triple-crown reef leviathan, faces LEFT.
// Parts (boss-director): crowns [0,.30] / hull [.30,.68] / fins [.68,1]x[0,.5] / tail [.68,1]x[.5,1]
// ---------------------------------------------------------------------------
function paintChoir() {
    const W = 640, H = 400;
    const c = canvas(W, H);
    const rng = mulberry32(1725);
    const cy = 200;
    // Trailing tendrils (right side, behind hull).
    for (let i = 0; i < 5; i++) {
        const y0 = 90 + i * 55;
        let x = 470, y = y0;
        for (let s = 0; s < 6; s++) {
            const nx = x + 22, ny = y + Math.sin(s * 1.2 + i) * 14;
            line(c, x, y, nx, ny, 5 - s * 0.6, [30, 48, 90, 255]);
            x = nx; y = ny;
        }
        glowDot(c, x, y, 6, i % 2 ? PAL.magenta : PAL.teal, [30, 50, 90, 255]);
    }
    // Tail fins (right).
    poly(c, [[470, 120], [610, 60], [596, 120], [560, 150]], [26, 40, 78, 255]);
    poly(c, [[470, 280], [610, 340], [596, 280], [560, 250]], [26, 40, 78, 255]);
    line(c, 480, 124, 600, 66, 3, [46, 230, 200, 220]);
    line(c, 480, 276, 600, 334, 3, [46, 230, 200, 220]);
    // Main hull: ridged mass tapering right.
    poly(c, [[120, cy - 130], [300, cy - 150], [430, cy - 110], [540, cy - 40], [540, cy + 40],
        [430, cy + 110], [300, cy + 150], [120, cy + 130], [90, cy],], PAL.hull);
    poly(c, [[120, cy - 130], [300, cy - 150], [430, cy - 110], [300, cy - 60], [140, cy - 70]], [44, 62, 108, 255]);
    poly(c, [[120, cy + 130], [300, cy + 150], [430, cy + 110], [300, cy + 60], [140, cy + 70]], PAL.hullLo);
    // Hull ridge plates.
    for (let i = 0; i < 6; i++) {
        const x = 200 + i * 52;
        poly(c, [[x, cy - 138 + i * 4], [x + 26, cy - 132 + i * 4], [x + 10, cy - 100 + i * 3]], [58, 78, 128, 255]);
        poly(c, [[x, cy + 138 - i * 4], [x + 26, cy + 132 - i * 4], [x + 10, cy + 100 - i * 3]], [16, 24, 50, 255]);
    }
    // Central maw core.
    glowDot(c, 205, cy, 30, PAL.magenta, [120, 40, 130, 255]);
    circle(c, 205, cy, 14, [25, 10, 30, 255]);
    circle(c, 205, cy, 14, [255, 79, 216, 255], 0);
    for (let i = 0; i < 12; i++) { // maw teeth ring
        const a = (i / 12) * Math.PI * 2;
        poly(c, [[205 + Math.cos(a - 0.1) * 14, cy + Math.sin(a - 0.1) * 14],
            [205 + Math.cos(a + 0.1) * 14, cy + Math.sin(a + 0.1) * 14],
            [205 + Math.cos(a) * 24, cy + Math.sin(a) * 24]], [223, 233, 255, 235]);
    }
    // Three singing crowns (front-left): polyp cups + tentacles + glowing throats.
    const crowns = [[118, 92, PAL.teal], [100, 200, PAL.magenta], [118, 308, PAL.teal]];
    crowns.forEach(([x, y, col], ci) => {
        poly(c, [[x - 30, y - 34], [x + 34, y - 26], [x + 30, y + 26], [x - 30, y + 34]], [20, 30, 60, 255]);
        poly(c, [[x - 30, y - 34], [x + 34, y - 26], [x + 10, y - 8], [x - 28, y - 12]], [52, 70, 118, 255]);
        glowDot(c, x - 6, y, 16, col, [30, 50, 90, 255]);
        for (let t = -2; t <= 2; t++) { // lips
            line(c, x - 32, y + t * 12, x - 52 - Math.abs(t) * -4, y + t * 16, 4, [30, 48, 90, 255]);
            glowDot(c, x - 54 + Math.abs(t) * 2, y + t * 16, 4, col, [30, 50, 90, 255]);
        }
        void ci;
    });
    // Hull light seams.
    line(c, 250, cy - 60, 480, cy - 30, 2, [46, 230, 200, 180]);
    line(c, 250, cy + 60, 480, cy + 30, 2, [46, 230, 200, 180]);
    for (let i = 0; i < 7; i++) {
        glowDot(c, 270 + i * 32, cy, 5, i % 2 ? PAL.violet : PAL.teal, [30, 50, 90, 255]);
    }
    speckle(c, rng, 130, 120, 60, 540, 340, [[60, 80, 130, 255]], 1, 2, 50, 110);
    return c;
}

// ---------------------------------------------------------------------------
// Powerup orbs (128px, match the shipped orb language: glow + dark ball + ring)
// ---------------------------------------------------------------------------
function orbBase(c, ring, ring2) {
    glowDot(c, 64, 64, 58, ring, [10, 20, 36, 255]);
    circle(c, 64, 64, 46, [10, 24, 40, 255]);
    circle(c, 64, 64, 46, ring, 0);
    for (let a = 0; a < Math.PI * 2; a += 0.06) { // ring
        circle(c, 64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46, 2.4, ring);
    }
    for (let a = 0; a < Math.PI * 2; a += 0.08) {
        circle(c, 64 + Math.cos(a) * 37, 64 + Math.sin(a) * 37, 1.2, ring2);
    }
    blob(c, 50, 46, 16, 10, -0.5, [255, 255, 255, 70]); // shine
}
function paintTorrentOrb() {
    const c = canvas(128, 128);
    orbBase(c, [46, 230, 200, 255], [158, 252, 255, 255]);
    // Triple lance chevrons.
    for (const dy of [-20, 0, 20]) {
        poly(c, [[44, 64 + dy - 9], [76, 64 + dy], [44, 64 + dy + 9]], [20, 60, 66, 255]);
        poly(c, [[48, 64 + dy - 6], [70, 64 + dy], [48, 64 + dy + 6]], [125, 255, 234, 255]);
    }
    glowDot(c, 84, 64, 8, [255, 255, 255, 255], [46, 230, 200, 255]);
    return c;
}
function paintPhaseOrb() {
    const c = canvas(128, 128);
    orbBase(c, [197, 106, 255, 255], [230, 200, 255, 255]);
    // Crescent: violet disc bitten by the ball color.
    circle(c, 64, 64, 26, [197, 106, 255, 255]);
    circle(c, 74, 56, 22, [10, 24, 40, 255]);
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
        circle(c, 64 + Math.cos(a) * 26, 64 + Math.sin(a) * 26, 1.4, [230, 200, 255, 220]);
    }
    glowDot(c, 52, 72, 7, [255, 255, 255, 255], [197, 106, 255, 255]);
    return c;
}

// ---------------------------------------------------------------------------
// Bake + verify stats
// ---------------------------------------------------------------------------
function alphaStats(c) {
    let minX = c.w, minY = c.h, maxX = -1, maxY = -1, count = 0;
    for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
            if (c.data[(y * c.w + x) * 4 + 3] > 8) {
                count++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    return { coverage: count / (c.w * c.h), bounds: [minX, minY, maxX, maxY] };
}
const JOBS = [
    ['assets/levels/neon-reef.png', paintBackground, 0.99],
    ['assets/levels/reef-scenery.png', paintScenery, 0.15],
    ['assets/levels/terrain/reef-wall.png', paintReefWall, 0.99],
    ['assets/levels/terrain/reef-arch.png', paintReefArch, 0.99],
    ['assets/levels/terrain/reef-pylon.png', paintReefPylon, 0.99],
    ['assets/levels/terrain/reef-bloom.png', paintReefBloom, 0.20],
    ['assets/bosses/neon-choir.png', paintChoir, 0.25],
    ['assets/enemy-reef-skimmer.png', paintSkimmer, 0.10],
    ['assets/enemy-reef-angler.png', paintAngler, 0.15],
    ['assets/powerup-torrent.png', paintTorrentOrb, 0.30],
    ['assets/powerup-phase.png', paintPhaseOrb, 0.30]
];
const baked = [];
for (const [rel, paint, minCoverage] of JOBS) {
    const c = paint();
    const bytes = writePng(path.join(ROOT, rel), c.w, c.h, c.data);
    const stats = alphaStats(c);
    const ok = stats.coverage >= minCoverage;
    baked.push({ file: rel, width: c.w, height: c.h, bytes, ...stats, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${rel} ${c.w}x${c.h} ${(bytes / 1024).toFixed(0)}KB ` +
        `coverage=${(stats.coverage * 100).toFixed(1)}% bounds=${stats.bounds.join(',')}`);
}
const failed = baked.filter(b => !b.ok);
if (failed.length) {
    console.error(`coverage below minimum for: ${failed.map(f => f.file).join(', ')}`);
    process.exit(1);
}
fs.writeFileSync(path.join(HERE, 'bake-report.json'), JSON.stringify({ baked }, null, 2) + '\n');
console.log(`baked ${baked.length} assets`);

