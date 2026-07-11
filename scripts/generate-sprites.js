#!/usr/bin/env node
/**
 * Bake detailed PNG game sprites (transparent) from SVG.
 * Run: node scripts/generate-sprites.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ASSETS = path.join(__dirname, '..', 'assets');

function powerupSvg({ ring, ring2, core, accent, symbol }) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <radialGradient id="glow" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="${ring}" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="${ring}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${ring}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ball" cx="38%" cy="32%" r="70%">
      <stop offset="0%" stop-color="#1a3048"/>
      <stop offset="55%" stop-color="#0a1828"/>
      <stop offset="100%" stop-color="#050c14"/>
    </radialGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="40%" stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <circle cx="64" cy="64" r="60" fill="url(#glow)"/>
  <circle cx="64" cy="64" r="46" fill="url(#ball)" stroke="${ring}" stroke-width="5"/>
  <circle cx="64" cy="64" r="38" fill="none" stroke="${ring2}" stroke-width="2.5" opacity="0.85"/>
  <circle cx="64" cy="64" r="30" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.55"/>
  ${symbol}
  <ellipse cx="50" cy="46" rx="16" ry="10" fill="url(#shine)"/>
  <circle cx="64" cy="64" r="46" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.2"/>
</svg>`;
}

const powerups = {
    'powerup-weapon.png': powerupSvg({
        ring: '#66f6ff',
        ring2: '#9efcff',
        core: '#ffe66d',
        accent: '#ffe66d',
        symbol: `
          <polygon points="48,40 86,64 48,88" fill="none" stroke="#ffe66d" stroke-width="4" stroke-linejoin="round"/>
          <polygon points="52,48 76,64 52,80" fill="#ffe66d"/>
          <circle cx="64" cy="64" r="7" fill="#ffffff"/>
        `
    }),
    'powerup-shield.png': powerupSvg({
        ring: '#55ffaa',
        ring2: '#a8ffd8',
        core: '#d7fff0',
        accent: '#a8ffd8',
        symbol: `
          <circle cx="64" cy="64" r="18" fill="none" stroke="#55ffaa" stroke-width="4"/>
          <circle cx="64" cy="64" r="11" fill="none" stroke="#d7fff0" stroke-width="3"/>
          <circle cx="64" cy="64" r="5" fill="#55ffaa"/>
          <path d="M64 42 L78 52 L78 70 L64 86 L50 70 L50 52 Z" fill="none" stroke="#a8ffd8" stroke-width="2" opacity="0.7"/>
        `
    }),
    'powerup-repair.png': powerupSvg({
        ring: '#ff6688',
        ring2: '#ffb0c0',
        core: '#ffd0da',
        accent: '#ffd0da',
        symbol: `
          <rect x="56" y="38" width="16" height="52" rx="3" fill="#ff6688" stroke="#ffd0da" stroke-width="2"/>
          <rect x="38" y="56" width="52" height="16" rx="3" fill="#ff6688" stroke="#ffd0da" stroke-width="2"/>
          <rect x="60" y="42" width="8" height="44" fill="#ffd0da" opacity="0.85"/>
          <rect x="42" y="60" width="44" height="8" fill="#ffd0da" opacity="0.85"/>
        `
    }),
    'powerup-boost.png': powerupSvg({
        ring: '#55ccff',
        ring2: '#a8e8ff',
        core: '#ffffff',
        accent: '#ffffff',
        symbol: `
          <polygon points="64,36 88,86 64,74 40,86" fill="#55ccff" stroke="#a8e8ff" stroke-width="2"/>
          <polygon points="64,48 76,78 64,70 52,78" fill="#ffffff"/>
          <rect x="60" y="72" width="8" height="14" fill="#55ccff"/>
        `
    }),
    'powerup-bomb.png': powerupSvg({
        ring: '#ffcc55',
        ring2: '#ffe6a0',
        core: '#fff0aa',
        accent: '#fff0aa',
        symbol: `
          <circle cx="64" cy="70" r="20" fill="#2a2010" stroke="#ffcc55" stroke-width="3"/>
          <circle cx="64" cy="70" r="13" fill="#ffcc55"/>
          <circle cx="60" cy="64" r="4" fill="#fff0aa"/>
          <rect x="61" y="38" width="6" height="16" rx="2" fill="#fff0aa"/>
          <circle cx="64" cy="36" r="5" fill="#ff8844"/>
          <circle cx="64" cy="36" r="2.5" fill="#ffe66d"/>
          <path d="M70 34 Q80 24 78 18" fill="none" stroke="#ffaa66" stroke-width="2"/>
        `
    })
};

const bossSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="280" viewBox="0 0 512 280">
  <defs>
    <linearGradient id="hull" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#b9285d"/>
      <stop offset="45%" stop-color="#781f4f"/>
      <stop offset="100%" stop-color="#3a1232"/>
    </linearGradient>
    <linearGradient id="wing" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ff6a75"/>
      <stop offset="100%" stop-color="#7a1840"/>
    </linearGradient>
    <radialGradient id="core" cx="40%" cy="45%" r="55%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="35%" stop-color="#ffdd66"/>
      <stop offset="100%" stop-color="#ff5533"/>
    </radialGradient>
    <radialGradient id="aura" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ff3355" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#ff3355" stop-opacity="0"/>
    </radialGradient>
    <filter id="glowSoft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- soft silhouette glow -->
  <ellipse cx="270" cy="140" rx="230" ry="110" fill="url(#aura)"/>

  <!-- rear thruster bank -->
  <polygon points="430,70 510,100 510,180 430,210" fill="#2a1027" stroke="#ff6a75" stroke-width="3"/>
  <rect x="440" y="95" width="50" height="90" rx="4" fill="#120810"/>
  <rect x="448" y="105" width="12" height="70" fill="#ff5577" opacity="0.85"/>
  <rect x="468" y="110" width="12" height="60" fill="#ffcc55" opacity="0.75"/>
  <rect x="488" y="115" width="8" height="50" fill="#66f6ff" opacity="0.55"/>

  <!-- upper wing blade -->
  <polygon points="210,20 470,95 250,108 200,70" fill="url(#wing)" stroke="#ff8a95" stroke-width="3"/>
  <polygon points="230,40 420,95 250,100" fill="#ffccdd" opacity="0.18"/>

  <!-- lower wing blade -->
  <polygon points="210,260 470,185 250,172 200,210" fill="url(#wing)" stroke="#ff8a95" stroke-width="3"/>
  <polygon points="230,240 420,185 250,180" fill="#ffccdd" opacity="0.18"/>

  <!-- main body -->
  <rect x="140" y="70" width="280" height="140" rx="10" fill="url(#hull)" stroke="#ff6a75" stroke-width="4"/>
  <rect x="160" y="88" width="240" height="104" rx="6" fill="#5a1840"/>
  <rect x="190" y="100" width="180" height="80" rx="4" fill="#2a1027"/>

  <!-- panel lines -->
  <line x1="170" y1="100" x2="390" y2="100" stroke="#ffccdd" stroke-width="1.5" opacity="0.25"/>
  <line x1="170" y1="180" x2="390" y2="180" stroke="#ffccdd" stroke-width="1.5" opacity="0.25"/>
  <line x1="250" y1="80" x2="250" y2="200" stroke="#ffccdd" stroke-width="1.5" opacity="0.2"/>
  <line x1="330" y1="80" x2="330" y2="200" stroke="#ffccdd" stroke-width="1.5" opacity="0.2"/>

  <!-- nose / prow -->
  <polygon points="20,140 150,55 150,225" fill="#3a1232" stroke="#ff8a95" stroke-width="4"/>
  <polygon points="40,140 145,75 145,205" fill="#781f4f"/>
  <polygon points="70,140 140,100 140,180" fill="#b9285d" opacity="0.85"/>

  <!-- reactor core -->
  <circle cx="175" cy="140" r="34" fill="#ffdd66" opacity="0.25" filter="url(#glowSoft)"/>
  <circle cx="175" cy="140" r="24" fill="url(#core)" stroke="#ffe6a0" stroke-width="3"/>
  <circle cx="175" cy="140" r="10" fill="#ffffff"/>

  <!-- weapon bays -->
  <g>
    <rect x="70" y="72" width="70" height="24" rx="3" fill="#1a0b18" stroke="#ffcc55" stroke-width="2.5"/>
    <rect x="48" y="128" width="86" height="24" rx="3" fill="#1a0b18" stroke="#ffcc55" stroke-width="2.5"/>
    <rect x="70" y="184" width="70" height="24" rx="3" fill="#1a0b18" stroke="#ffcc55" stroke-width="2.5"/>
    <circle cx="82" cy="84" r="5" fill="#ff5577"/>
    <circle cx="60" cy="140" r="5" fill="#ff5577"/>
    <circle cx="82" cy="196" r="5" fill="#ff5577"/>
    <rect x="95" y="79" width="30" height="10" fill="#ffcc55" opacity="0.35"/>
    <rect x="80" y="135" width="36" height="10" fill="#ffcc55" opacity="0.35"/>
    <rect x="95" y="191" width="30" height="10" fill="#ffcc55" opacity="0.35"/>
  </g>

  <!-- armor rivets -->
  <g fill="#ffccdd" opacity="0.45">
    <circle cx="200" cy="95" r="2.5"/><circle cx="230" cy="95" r="2.5"/>
    <circle cx="280" cy="95" r="2.5"/><circle cx="320" cy="95" r="2.5"/>
    <circle cx="200" cy="185" r="2.5"/><circle cx="230" cy="185" r="2.5"/>
    <circle cx="280" cy="185" r="2.5"/><circle cx="320" cy="185" r="2.5"/>
  </g>

  <!-- bridge canopy -->
  <rect x="300" y="118" width="70" height="44" rx="4" fill="#120810" stroke="#66f6ff" stroke-width="2"/>
  <rect x="310" y="126" width="50" height="28" rx="2" fill="#1a4060" opacity="0.85"/>
  <line x1="320" y1="130" x2="350" y2="150" stroke="#66f6ff" stroke-width="1.5" opacity="0.5"/>
</svg>`;

async function writePng(filename, svg, width, height) {
    const out = path.join(ASSETS, filename);
    await sharp(Buffer.from(svg))
        .resize(width, height, {
            kernel: sharp.kernel.lanczos3,
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toFile(out);
    const stat = fs.statSync(out);
    console.log('wrote', filename, `(${stat.size} bytes)`);
}

async function main() {
    fs.mkdirSync(ASSETS, { recursive: true });

    for (const [filename, svg] of Object.entries(powerups)) {
        await writePng(filename, svg, 96, 96);
    }

    await writePng('boss-ship.png', bossSvg, 360, 196);
    console.log('Sprite assets ready in assets/');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
