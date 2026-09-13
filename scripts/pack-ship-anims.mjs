#!/usr/bin/env node
/**
 * Key gray backdrops, lock each ship on its nose (or fuselage top),
 * and stack uniform-alpha frames into sprite sheets.
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'assets');
const PREVIEW = '/tmp/ship-anim/preview';
fs.mkdirSync(PREVIEW, { recursive: true });

function isBackdrop(r, g, b, bg) {
    const dist = Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const grayRange = max - min;
    const brightness = (r + g + b) / 3;
    return dist <= 48 || (grayRange <= 22 && brightness >= 36 && brightness <= 120);
}

function sampleBg(data, w, h, channels) {
    const pts = [
        [2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3],
        [Math.floor(w / 2), 2], [Math.floor(w / 2), h - 3]
    ];
    let r = 0, g = 0, b = 0;
    for (const [x, y] of pts) {
        const i = (y * w + x) * channels;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
    }
    return [r / pts.length, g / pts.length, b / pts.length];
}

function keyFromEdges(data, w, h, channels) {
    const alpha = new Uint8Array(w * h);
    alpha.fill(255);
    const bg = sampleBg(data, w, h, channels);
    const colorAt = (p) => {
        const i = p * channels;
        return isBackdrop(data[i], data[i + 1], data[i + 2], bg);
    };
    const seen = new Uint8Array(w * h);
    const stack = [];
    const push = (x, y) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const i = y * w + x;
        if (seen[i]) return;
        seen[i] = 1;
        if (!colorAt(i)) return;
        stack.push(i);
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (stack.length) {
        const i = stack.pop();
        alpha[i] = 0;
        const x = i % w;
        const y = (i / w) | 0;
        push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
    }
    // Hair gaps and other enclosed backdrop pockets match the sampled gray.
    for (let p = 0, i = 0; p < w * h; p++, i += channels) {
        if (!alpha[p]) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const dist = Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const grayRange = max - min;
        const brightness = (r + g + b) / 3;
        if (dist <= 28 || (grayRange <= 14 && brightness >= 50 && brightness <= 115)) {
            alpha[p] = 0;
        }
    }
    cleanFringe(alpha, data, w, h, channels);
    return alpha;
}

function isHotGlow(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const brightness = (r + g + b) / 3;
    const sat = max - min;
    const cyan = b > 130 && g > 110 && b >= r + 15;
    const orange = r > 140 && g > 80 && r > b + 30;
    return brightness >= 175 || (sat >= 55 && (cyan || orange) && brightness >= 110);
}

function cleanFringe(alpha, data, w, h, channels) {
    for (let pass = 0; pass < 4; pass++) {
        const kill = [];
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const p = y * w + x;
                if (!alpha[p]) continue;
                const i = p * channels;
                const r = data[i], g = data[i + 1], b = data[i + 2];
                if (isHotGlow(r, g, b)) continue;
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const sat = max - min;
                const brightness = (r + g + b) / 3;
                const neighborClear =
                    !alpha[p - 1] || !alpha[p + 1] || !alpha[p - w] || !alpha[p + w];
                if (!neighborClear) continue;
                if (sat <= 48 && brightness >= 40 && brightness <= 150) kill.push(p);
            }
        }
        for (const p of kill) alpha[p] = 0;
    }
}

function findNose(alpha, w, h) {
    let minX = w;
    let y0 = h;
    let y1 = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!alpha[y * w + x]) continue;
            if (x < minX) {
                minX = x;
                y0 = y;
                y1 = y;
            } else if (x === minX) {
                y0 = Math.min(y0, y);
                y1 = Math.max(y1, y);
            }
        }
    }
    return { x: minX, y: (y0 + y1) / 2 };
}

function findTopCenter(alpha, w, h) {
    const x0 = Math.floor(w * 0.32);
    const x1 = Math.ceil(w * 0.68);
    let minY = h;
    let sx = 0;
    let n = 0;
    for (let y = 0; y < h; y++) {
        for (let x = x0; x < x1; x++) {
            if (!alpha[y * w + x]) continue;
            if (y < minY) {
                minY = y;
                sx = x;
                n = 1;
            } else if (y === minY) {
                sx += x;
                n += 1;
            }
        }
        if (n) break;
    }
    return { x: n ? sx / n : w / 2, y: minY };
}

async function loadKeyed(file) {
    const { data, info } = await sharp(file)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const w = info.width;
    const h = info.height;
    const alpha = keyFromEdges(data, w, h, info.channels);
    const rgba = Buffer.alloc(w * h * 4);
    for (let p = 0, s = 0, d = 0; p < w * h; p++, s += info.channels, d += 4) {
        rgba[d] = data[s];
        rgba[d + 1] = data[s + 1];
        rgba[d + 2] = data[s + 2];
        rgba[d + 3] = alpha[p];
    }
    return { rgba, w, h, alpha };
}

async function loadKeyedOrAlpha(file) {
    const meta = await sharp(file).metadata();
    if (meta.hasAlpha && /\.png$/i.test(file)) {
        const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const alpha = new Uint8Array(info.width * info.height);
        let transparent = 0;
        for (let p = 0; p < alpha.length; p++) {
            alpha[p] = data[p * 4 + 3];
            if (alpha[p] < 8) transparent += 1;
        }
        if (transparent > info.width * info.height * 0.05) {
            return { rgba: Buffer.from(data), w: info.width, h: info.height, alpha };
        }
    }
    return loadKeyed(file);
}

function pasteIntoCell(src, cellW, cellH, anchorSrc, anchorDst) {
    const out = Buffer.alloc(cellW * cellH * 4);
    const ox = Math.round(anchorDst.x - anchorSrc.x);
    const oy = Math.round(anchorDst.y - anchorSrc.y);
    for (let y = 0; y < src.h; y++) {
        const dy = y + oy;
        if (dy < 0 || dy >= cellH) continue;
        for (let x = 0; x < src.w; x++) {
            const dx = x + ox;
            if (dx < 0 || dx >= cellW) continue;
            const si = (y * src.w + x) * 4;
            const a = src.rgba[si + 3];
            if (!a) continue;
            const di = (dy * cellW + dx) * 4;
            out[di] = src.rgba[si];
            out[di + 1] = src.rgba[si + 1];
            out[di + 2] = src.rgba[si + 2];
            out[di + 3] = a;
        }
    }
    return out;
}

async function packSheet(name, files, { cellW, cellH, mode, destAnchor }) {
    const frames = [];
    for (const file of files) {
        const src = await loadKeyedOrAlpha(file);
        const anchor = mode === 'top'
            ? findTopCenter(src.alpha, src.w, src.h)
            : findNose(src.alpha, src.w, src.h);
        frames.push({ file, src, anchor });
        console.log(name, path.basename(file),
            `${src.w}x${src.h}`, 'anchor', anchor.x.toFixed(1), anchor.y.toFixed(1));
    }

    const cells = frames.map(frame => pasteIntoCell(frame.src, cellW, cellH, frame.anchor, destAnchor));
    const sheetH = cellH * cells.length;
    const sheet = Buffer.alloc(cellW * sheetH * 4);
    cells.forEach((cell, i) => {
        sheet.set(cell, i * cellW * cellH * 4);
    });
    const sheetPath = path.join(OUT, name);
    const outW = Math.round(cellW / 2);
    const outH = Math.round(sheetH / 2);
    await sharp(sheet, { raw: { width: cellW, height: sheetH, channels: 4 } })
        .resize(outW, outH, { kernel: 'lanczos3' })
        .png({ compressionLevel: 9, palette: true, effort: 10 })
        .toFile(sheetPath);
    const meta = await sharp(sheetPath).metadata();
    console.log('wrote', sheetPath, meta.width + 'x' + meta.height, 'frames', cells.length);

    for (let i = 0; i < cells.length; i++) {
        await sharp(cells[i], { raw: { width: cellW, height: cellH, channels: 4 } })
            .png()
            .toFile(path.join(PREVIEW, `${path.basename(name, '.png')}-${String(i).padStart(2, '0')}.png`));
    }
    return { cellW, cellH, count: cells.length, path: sheetPath };
}

const flight = [
    '/tmp/ship-anim/player-flight/f0.jpg',
    '/tmp/ship-anim/player-flight/f1.jpg',
    '/tmp/ship-anim/player-flight/f2.jpg',
    '/tmp/ship-anim/player-flight/f3.jpg',
    '/tmp/ship-anim/player-flight/f4b.jpg',
    '/tmp/ship-anim/player-flight/f5.jpg',
    '/tmp/ship-anim/player-flight/f7.jpg'
];
const boost = [
    '/tmp/ship-anim/player-boost/b0.jpg',
    '/tmp/ship-anim/player-boost/b3.jpg',
    '/tmp/ship-anim/player-boost/b1.jpg',
    '/tmp/ship-anim/player-boost/b4.jpg',
    '/tmp/ship-anim/player-boost/b5.jpg'
];
const vertical = [
    path.join(OUT, 'player-vertical.png'),
    '/tmp/ship-anim/player-vertical/v0.jpg',
    '/tmp/ship-anim/player-vertical/v4.jpg',
    '/tmp/ship-anim/player-vertical/v1.jpg',
    '/tmp/ship-anim/player-vertical/v2.jpg',
    '/tmp/ship-anim/player-vertical/v5.jpg',
    '/tmp/ship-anim/player-vertical/v3.jpg'
];
const red = [
    '/tmp/ship-anim/enemy-red/e3.jpg',
    '/tmp/ship-anim/enemy-red/e7.jpg',
    '/tmp/ship-anim/enemy-red/e4.jpg',
    '/tmp/ship-anim/enemy-red/e5.jpg',
    '/tmp/ship-anim/enemy-red/e6.jpg'
];
const blue = [
    '/tmp/ship-anim/enemy-blue/b4.jpg',
    '/tmp/ship-anim/enemy-blue/b1.jpg',
    '/tmp/ship-anim/enemy-blue/b7.jpg',
    '/tmp/ship-anim/enemy-blue/b6.jpg'
];

const result = {};
result.flight = await packSheet('player-flight-cycle.png', flight, {
    cellW: 1200, cellH: 720, mode: 'nose', destAnchor: { x: 56, y: 500 }
});
result.boost = await packSheet('player-boost-cycle.png', boost, {
    cellW: 1200, cellH: 720, mode: 'nose', destAnchor: { x: 56, y: 500 }
});
if (!process.argv.includes('--player-only')) {
    result.vertical = await packSheet('player-vertical-cycle.png', vertical, {
        cellW: 768, cellH: 1400, mode: 'top', destAnchor: { x: 384, y: 28 }
    });
    result.red = await packSheet('enemy-flight-cycle.png', red, {
        cellW: 1280, cellH: 400, mode: 'nose', destAnchor: { x: 90, y: 280 }
    });
    result.blue = await packSheet('enemy2-flight-cycle.png', blue, {
        cellW: 1280, cellH: 400, mode: 'nose', destAnchor: { x: 90, y: 280 }
    });
}
console.log(JSON.stringify(result, null, 2));
