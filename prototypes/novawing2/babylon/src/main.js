import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, GlowLayer, HemisphericLight,
  MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3, WebGPUEngine
} from '@babylonjs/core';
import './style.css';

const $ = (id) => document.getElementById(id);
const canvas = $('renderCanvas');
const keys = new Set();
const input = { stickX: 0, stickY: 0, fire: false, boost: false };
const W = 18, H = 10.2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const testWaves = Number(new URLSearchParams(location.search).get('testWaves'));
const WAVE_DURATION = Number.isFinite(testWaves) && testWaves >= 1 && testWaves <= 60 ? testWaves : 60;
const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const vec = (x, y, z = 0) => new Vector3(x, y, z);
let engine, scene, camera, player, boss = null;
let stars = [], enemies = [], bullets = [], pickups = [], effects = [];
let game = { phase: 'ready', resume: 'waves', elapsed: 0, bossTime: 0, score: 0, hp: 3, invuln: 0, fireCd: 0, waveCd: 1.5, waveIndex: 0, autoFire: false, weapon: 1, pickIndex: 0, bossHp: 100, bossSpawned: false, shotsFired: 0, noticeFor: 0 };
window.novaWing2State = { ready: false, phase: 'loading' };
let mats = {};

function material(name, diffuse, emissive = null, alpha = 1) {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(diffuse);
  m.specularColor = new Color3(.65, .8, 1);
  m.emissiveColor = Color3.FromHexString(emissive || '#000000');
  m.alpha = alpha;
  return m;
}
function box(parent, name, size, pos, mat, rot = 0) {
  const mesh = MeshBuilder.CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, scene);
  mesh.parent = parent; mesh.position = vec(...pos); mesh.rotation.z = rot; mesh.material = mat; return mesh;
}
function sphere(parent, name, diameter, pos, mat, segments = 12) {
  const mesh = MeshBuilder.CreateSphere(name, { diameter, segments }, scene);
  mesh.parent = parent; mesh.position = vec(...pos); mesh.material = mat; return mesh;
}
function cylinder(parent, name, h, top, bottom, pos, mat, rot = -Math.PI / 2, tess = 12) {
  const mesh = MeshBuilder.CreateCylinder(name, { height: h, diameterTop: top, diameterBottom: bottom, tessellation: tess }, scene);
  mesh.parent = parent; mesh.position = vec(...pos); mesh.rotation.z = rot; mesh.material = mat; return mesh;
}
function ship(name, palette, size = 1) {
  const root = new TransformNode(name, scene);
  const body = palette === 'player' ? mats.playerBody : mats.enemyBody;
  const edge = palette === 'player' ? mats.playerEdge : mats.enemyEdge;
  const glow = palette === 'player' ? mats.cyan : mats.red;
  // All pieces have real depth and separate materials, so the mesh can later be replaced by a GLB.
  cylinder(root, 'fuselage', 1.25, .28, .5, [0, 0, 0], body);
  cylinder(root, 'nose', .65, 0, .29, [.82, 0, 0], edge);
  box(root, 'portWing', [1.25, .16, .2], [-.18, .45, .04], edge, -.29);
  box(root, 'starboardWing', [1.25, .16, .2], [-.18, -.45, .04], edge, .29);
  box(root, 'portBlade', [.4, .15, .22], [-.61, .91, 0], body, -.35);
  box(root, 'starboardBlade', [.4, .15, .22], [-.61, -.91, 0], body, .35);
  sphere(root, 'cockpit', .48, [.24, 0, -.28], mats.glass);
  box(root, 'portTrace', [.72, .045, .07], [.04, .4, -.15], glow, -.28);
  box(root, 'starboardTrace', [.72, .045, .07], [.04, -.4, -.15], glow, .28);
  cylinder(root, 'engineLeft', .25, .28, .32, [-.78, .22, .05], mats.engine);
  cylinder(root, 'engineRight', .25, .28, .32, [-.78, -.22, .05], mats.engine);
  const flameL = cylinder(root, 'flameLeft', .56, .04, .24, [-1.08, .22, .05], glow, Math.PI / 2);
  const flameR = cylinder(root, 'flameRight', .56, .04, .24, [-1.08, -.22, .05], glow, Math.PI / 2);
  root.scaling = vec(size, size, size);
  root.metadata = { flames: [flameL, flameR] };
  return root;
}
function bossMesh() {
  const root = new TransformNode('dreadnaught', scene);
  cylinder(root, 'mainHull', 3.4, 1.2, 1.65, [-.3, 0, .25], mats.bossBody);
  cylinder(root, 'armoredProw', 1.55, .08, 1.25, [1.8, 0, .1], mats.bossEdge);
  for (const s of [-1, 1]) {
    box(root, 'sweptWing', [3, .48, .38], [-.5, s * 1.22, .1], mats.bossEdge, s * .24);
    box(root, 'wingTip', [1.2, .35, .4], [-1.55, s * 2.06, .06], mats.bossBody, s * .37);
    box(root, 'redStripe', [2.2, .09, .08], [-.38, s * 1.25, -.17], mats.red, s * .24);
    cylinder(root, 'sideGun', .9, .2, .34, [1.02, s * 1.57, -.15], mats.engine);
    sphere(root, 'gunLight', .23, [1.5, s * 1.57, -.15], mats.orange);
  }
  sphere(root, 'commandDome', 1.13, [.48, 0, -.53], mats.glassRed);
  cylinder(root, 'reactorRim', .65, 1.03, 1.03, [-1.85, 0, .13], mats.engine, -Math.PI / 2, 16);
  sphere(root, 'reactor', .75, [-2.24, 0, .08], mats.red);
  root.scaling = vec(.82, .82, .82);
  return root;
}
function disposeObject(o) { if (o?.mesh) o.mesh.dispose(false, false); }
function reset() {
  [...enemies, ...bullets, ...pickups, ...effects].forEach(disposeObject);
  if (boss) boss.mesh.dispose(false, false);
  enemies = []; bullets = []; pickups = []; effects = []; boss = null;
  game = { phase: 'waves', resume: 'waves', elapsed: 0, bossTime: 0, score: 0, hp: 3, invuln: 0, fireCd: 0, waveCd: 1.5, waveIndex: 0, autoFire: game.autoFire, weapon: 1, pickIndex: 0, bossHp: 100, bossSpawned: false, shotsFired: 0, noticeFor: 0 };
  player.position = vec(-6.4, 0, -.2); player.setEnabled(true);
  $('banner').hidden = true; $('boss-hud').hidden = true;
  say('OPEN SPACE', 2.2); updateHud();
}
function say(message, seconds = 1.8) { $('notice').textContent = message; $('notice').classList.add('visible'); game.noticeFor = seconds; }
function showBanner(title, subtitle, button) {
  $('banner').hidden = false; $('banner').querySelector('.eyebrow').textContent = 'MISSION 01 · OPEN SPACE';
  $('banner').querySelector('h1').innerHTML = title;
  $('banner').querySelector('p').textContent = subtitle;
  $('start').innerHTML = `${button} <span>↗</span>`;
}
function finish(won) {
  game.phase = won ? 'won' : 'lost';
  $('boss-hud').hidden = true;
  showBanner(won ? 'SECTOR <span>CLEARED</span>' : 'HULL <span>LOST</span>', won ? `Dreadnaught destroyed · Final score ${game.score.toLocaleString()}` : `Score ${game.score.toLocaleString()} · Try another run`, 'FLY AGAIN');
}
function pause() {
  if (game.phase === 'waves' || game.phase === 'boss') { game.resume = game.phase; game.phase = 'paused'; showBanner('FLIGHT <span>PAUSED</span>', 'Take a breath. The void can wait.', 'RESUME FLIGHT'); }
  else if (game.phase === 'paused') { game.phase = game.resume; $('banner').hidden = true; }
}
function makeBullet(x, y, friendly, vx, vy = 0, damage = 1) {
  if (friendly) game.shotsFired++;
  const root = new TransformNode(friendly ? 'plasmaBolt' : 'hostileBolt', scene);
  sphere(root, 'halo', friendly ? .34 : .37, [0, 0, .1], friendly ? mats.cyanHalo : mats.redHalo);
  cylinder(root, 'core', friendly ? .5 : .38, .065, .065, [0, 0, -.08], friendly ? mats.cyan : mats.orange);
  root.position = vec(x, y, -.15);
  bullets.push({ mesh: root, x, y, vx, vy, friendly, damage, r: friendly ? .16 : .19 });
}
function shoot() {
  if (game.fireCd > 0) return;
  game.fireCd = game.weapon >= 3 ? .105 : .17;
  const x = player.position.x + .95, y = player.position.y;
  makeBullet(x, y, true, 15, 0, game.weapon >= 2 ? 2 : 1);
  if (game.weapon >= 2) { makeBullet(x - .1, y + .26, true, 15, .38); makeBullet(x - .1, y - .26, true, 15, -.38); }
  if (game.weapon >= 3) { makeBullet(x - .2, y + .37, true, 15, 1.3); makeBullet(x - .2, y - .37, true, 15, -1.3); }
}
function spawnEnemy(x, y, type = 'scout', vx = -3.2, drift = 0) {
  let mesh;
  const asteroid = type === 'asteroid' || type === 'mine';
  if (asteroid) {
    mesh = MeshBuilder.CreateIcoSphere('asteroid', { radius: type === 'mine' ? .45 : .54, subdivisions: 1 }, scene);
    mesh.material = type === 'mine' ? mats.mine : mats.rock;
  } else mesh = ship(type, 'enemy', type === 'interceptor' ? .72 : .82);
  mesh.position = vec(x, y, 0);
  enemies.push({ mesh, x, y, baseY: y, vx, drift, t: 0, type, hp: asteroid ? (type === 'mine' ? 1 : 3) : (type === 'interceptor' ? 2 : 3), r: asteroid ? .47 : .46, shotCd: rand(1.4, 3.3), score: asteroid ? 70 : 100 });
}
function wavePattern() {
  const t = game.elapsed;
  const limited = t < 7 || (t >= 28 && t < 34) || t >= 54;
  const patterns = limited ? ['v', 'diagonal'] : t < 14 ? ['v', 'diagonal', 'swarm', 'asteroid', 'mine', 'dive'] : ['v', 'diagonal', 'swarm', 'asteroid', 'mine', 'dive', 'chaser', 'sandwich', 'interceptor'];
  const type = patterns[game.waveIndex % patterns.length]; game.waveIndex++;
  const x = 10.2, y = rand(-3.5, 3.5);
  if (type === 'v') for (let i = 0; i < 5; i++) spawnEnemy(x + Math.abs(i - 2) * .64, clamp(y + (i - 2) * .68, -4.3, 4.3), 'scout', -3.25);
  else if (type === 'diagonal') for (let i = 0; i < 4; i++) spawnEnemy(x + i * .55, -3.5 + i * 2.2, 'scout', -3.5);
  else if (type === 'swarm') for (let i = 0; i < 6; i++) spawnEnemy(x + i * .44, clamp(y + Math.sin(i * 2.2) * .8, -4.2, 4.2), 'interceptor', -4.25, 1.5);
  else if (type === 'asteroid') for (let i = 0; i < 5; i++) spawnEnemy(x + i * .95, clamp(-3.5 + i * 1.75, -4.3, 4.3), 'asteroid', -2.5);
  else if (type === 'mine') for (let i = 0; i < 4; i++) spawnEnemy(x + i * .88, clamp(y + (i - 1.5) * .65, -4.3, 4.3), 'mine', -2.15);
  else if (type === 'dive') for (let i = 0; i < 3; i++) spawnEnemy(x + i * .7, 4.5 - i * .3, 'interceptor', -3.4, -1.7);
  else if (type === 'chaser') for (let i = 0; i < 3; i++) spawnEnemy(x + i * .85, clamp(player.position.y + (i - 1) * 1.2, -4, 4), 'scout', -4.1, .7);
  else if (type === 'sandwich') for (let i = 0; i < 3; i++) { spawnEnemy(x + i * .75, -3.4 + i * .4, 'scout', -3.6, .5); spawnEnemy(x + i * .75, 3.4 - i * .4, 'scout', -3.6, -.5); }
  else { spawnEnemy(x, 3, 'interceptor', -5.2, -.7); spawnEnemy(x + .6, -3, 'interceptor', -5.2, .7); }
  const interval = t < 14 ? rand(2.2, 2.8) : t < 28 ? rand(1.9, 2.3) : t < 34 ? rand(3.2, 3.8) : t < 54 ? rand(1.55, 2.05) : rand(3.2, 3.8);
  game.waveCd = interval;
}
const pickupSchedule = [
  [4, 'weapon', 1.8], [10, 'boost', -2.5], [16, 'weapon', 0], [22, 'shield', 2.3], [28, 'repair', -2.5],
  [34, 'weapon', .4], [40, 'boost', 2.3], [46, 'weapon', -1.3], [52, 'shield', 1]
];
function spawnPickup(type, y) {
  const mesh = new TransformNode(`pickup-${type}`, scene);
  const orb = sphere(mesh, 'pod', .53, [0, 0, -.1], type === 'weapon' ? mats.gold : type === 'repair' ? mats.green : mats.cyan);
  box(mesh, 'leftFrame', [.08, .68, .1], [-.36, 0, 0], mats.playerEdge);
  box(mesh, 'rightFrame', [.08, .68, .1], [.36, 0, 0], mats.playerEdge);
  mesh.position = vec(10, y, 0);
  pickups.push({ mesh, x: 10, y, type, t: 0, orb });
}
function collect(p) {
  if (p.type === 'weapon') { game.weapon = Math.min(3, game.weapon + 1); say(`WEAPON LEVEL ${game.weapon}`, 1.2); }
  else if (p.type === 'repair') { game.hp = Math.min(3, game.hp + 1); say('HULL REPAIRED', 1.2); }
  else if (p.type === 'shield') { game.invuln = 4; say('SHIELD ONLINE', 1.2); }
  else { game.score += 150; say('BOOST ENERGY', 1.2); }
  game.score += 50;
}
function blast(x, y, color = 'orange', count = 8) {
  for (let i = 0; i < count; i++) {
    const mesh = MeshBuilder.CreateSphere('debris', { diameter: rand(.06, .16), segments: 6 }, scene);
    mesh.material = color === 'cyan' ? mats.cyan : mats.orange;
    mesh.position = vec(x, y, rand(-.3, .3));
    effects.push({ mesh, x, y, vx: rand(-3.4, 3.4), vy: rand(-3.2, 3.2), life: rand(.3, .7) });
  }
}
function damagePlayer() {
  if (game.invuln > 0 || game.phase !== 'waves' && game.phase !== 'boss') return;
  game.hp--; game.invuln = 1.5; blast(player.position.x, player.position.y, 'cyan', 12); say('HULL HIT', .8);
  if (game.hp <= 0) { player.setEnabled(false); finish(false); }
}
function startBoss() {
  enemies.forEach(disposeObject); enemies = [];
  game.phase = 'boss'; game.bossTime = 0; game.bossHp = 100; game.bossSpawned = true;
  const mesh = bossMesh(); mesh.position = vec(10.5, 0, 0);
  boss = { mesh, x: 10.5, y: 0, shotCd: 2.0, entered: false };
  $('boss-hud').hidden = false;
  say('DREADNAUGHT INBOUND', 2.6);
}
function bossVolley() {
  if (!boss) return;
  const fromX = boss.x - 1.7;
  const dy = player.position.y - boss.y, dx = player.position.x - fromX;
  const angle = Math.atan2(dy, dx);
  for (const a of [-.27, 0, .27]) makeBullet(fromX, boss.y + a * 2, false, Math.cos(angle + a) * 5.9, Math.sin(angle + a) * 5.9);
  if (game.bossHp < 50) for (const y of [-1.9, 1.9]) makeBullet(fromX, boss.y + y, false, -6.2, 0);
}
function updateHud() {
  $('score').textContent = `${game.score}`.padStart(6, '0');
  $('health').textContent = Array.from({ length: 3 }, (_, i) => i < game.hp ? '◆' : '◇').join(' ');
  $('time').textContent = game.phase === 'boss' || game.phase === 'won' ? 'BOSS' : `00:${`${Math.max(0, Math.ceil(WAVE_DURATION - game.elapsed))}`.padStart(2, '0')}`;
  $('phase').textContent = game.phase === 'boss' ? 'DREADNAUGHT' : 'OPEN SPACE';
  $('progress-fill').style.width = `${clamp(game.elapsed / WAVE_DURATION * 100, 0, 100)}%`;
  $('boss-fill').style.width = `${game.bossHp}%`;
  $('boss-health').textContent = `${game.bossHp}%`;
  $('auto-toggle').querySelector('span').textContent = game.autoFire ? 'ON' : 'OFF';
  $('autofire-copy').textContent = `AUTO FIRE: ${game.autoFire ? 'ON' : 'OFF'}`;
}
function update(dt) {
  const s = Math.min(dt, .05);
  if (game.phase !== 'waves' && game.phase !== 'boss') return;
  if (game.noticeFor > 0) { game.noticeFor -= s; if (game.noticeFor <= 0) $('notice').classList.remove('visible'); }
  if (game.phase === 'waves') {
    game.elapsed += s; game.waveCd -= s;
    if (game.waveCd <= 0) wavePattern();
    while (game.pickIndex < pickupSchedule.length && game.elapsed >= pickupSchedule[game.pickIndex][0]) {
      const [, type, y] = pickupSchedule[game.pickIndex++]; spawnPickup(type, y);
    }
    if (game.elapsed >= WAVE_DURATION) startBoss();
  } else {
    game.bossTime += s;
    if (!boss.entered) { boss.x = Math.max(5.3, boss.x - 2.3 * s); if (boss.x <= 5.3) boss.entered = true; }
    boss.y = Math.sin(game.bossTime * .79) * 2.15;
    boss.mesh.position.x = boss.x; boss.mesh.position.y = boss.y;
    if (boss.entered) { boss.shotCd -= s; if (boss.shotCd <= 0) { bossVolley(); boss.shotCd = game.bossHp < 50 ? .9 : 1.35; } }
  }
  let dx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + input.stickX;
  let dy = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + input.stickY;
  const len = Math.hypot(dx, dy); if (len > 1) { dx /= len; dy /= len; }
  const boosting = input.boost || keys.has('ShiftLeft') || keys.has('ShiftRight');
  const speed = boosting ? 9.2 : 6.3;
  player.position.x = clamp(player.position.x + dx * speed * s, -8, 2.4);
  player.position.y = clamp(player.position.y + dy * speed * s, -4.35, 4.35);
  player.rotation.z += (clamp(dy * .15, -.16, .16) - player.rotation.z) * Math.min(1, 12 * s);
  player.metadata.flames.forEach((f, i) => { f.scaling.y = (boosting ? 1.8 : 1) + Math.sin(game.elapsed * 39 + i) * .17; });
  if (game.invuln > 0) { game.invuln -= s; player.setEnabled(Math.floor(game.invuln * 12) % 2 === 0); }
  else player.setEnabled(true);
  game.fireCd -= s;
  if (keys.has('Space') || input.fire || game.autoFire) shoot();
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i]; e.t += s; e.x += e.vx * s; e.y = clamp(e.y + e.drift * s + (e.type === 'interceptor' ? Math.sin(e.t * 6) * .013 : 0), -4.6, 4.6);
    e.mesh.position.x = e.x; e.mesh.position.y = e.y;
    if (e.type === 'asteroid' || e.type === 'mine') e.mesh.rotation.z += s * 1.4;
    if (e.type === 'scout' || e.type === 'interceptor') { e.shotCd -= s; if (e.shotCd <= 0 && e.x < 8.3 && e.x > -4 && Math.random() < .53) { makeBullet(e.x - .6, e.y, false, -5.4, clamp((player.position.y - e.y) * .28, -1.4, 1.4)); e.shotCd = rand(2.4, 3.7); } }
    if (distance2(e, player.position) < (e.r + .35) ** 2) { damagePlayer(); blast(e.x, e.y); disposeObject(e); enemies.splice(i, 1); continue; }
    if (e.x < -10.6) { disposeObject(e); enemies.splice(i, 1); }
  }
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; b.x += b.vx * s; b.y += b.vy * s; b.mesh.position.x = b.x; b.mesh.position.y = b.y;
    let hit = false;
    if (b.friendly) {
      if (boss && boss.entered && b.x > boss.x - 2.3 && b.x < boss.x + 1.7 && Math.abs(b.y - boss.y) < 1.45) {
        game.bossHp = Math.max(0, game.bossHp - b.damage); hit = true; blast(b.x, b.y, 'orange', 2);
        if (game.bossHp <= 0) { blast(boss.x, boss.y, 'orange', 35); boss.mesh.dispose(false, false); boss = null; game.score += 1500; finish(true); }
      }
      if (!hit) for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j]; if (distance2(b, e) < (b.r + e.r) ** 2) { e.hp -= b.damage; hit = true; if (e.hp <= 0) { game.score += e.score; blast(e.x, e.y); disposeObject(e); enemies.splice(j, 1); } break; }
      }
    } else if (distance2(b, player.position) < (b.r + .32) ** 2) { damagePlayer(); hit = true; }
    if (hit || b.x > 11 || b.x < -11 || Math.abs(b.y) > 6) { disposeObject(b); bullets.splice(i, 1); }
  }
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]; p.t += s; p.x -= 2.4 * s; p.mesh.position.x = p.x; p.mesh.rotation.z += s * .8; p.orb.scaling.setAll(1 + Math.sin(p.t * 5) * .08);
    if (distance2(p, player.position) < .9 ** 2) { collect(p); disposeObject(p); pickups.splice(i, 1); }
    else if (p.x < -10) { disposeObject(p); pickups.splice(i, 1); }
  }
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.life -= s; e.x += e.vx * s; e.y += e.vy * s; e.mesh.position.x = e.x; e.mesh.position.y = e.y; e.mesh.scaling.setAll(Math.max(.01, e.life));
    if (e.life <= 0) { disposeObject(e); effects.splice(i, 1); }
  }
  for (const st of stars) { st.mesh.position.x -= st.speed * s; if (st.mesh.position.x < -10.4) st.mesh.position.x = 10.4; }
  updateHud();
}
async function init() {
  try {
    if (navigator.gpu && window.isSecureContext) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter && canvas.getContext('webgpu')) { engine = new WebGPUEngine(canvas, { antialias: true, adaptToDeviceRatio: true }); await engine.initAsync(); $('renderer').textContent = 'WEBGPU'; }
      }
      catch (err) { console.warn('WebGPU unavailable; using WebGL', err); try { engine?.dispose(); } catch (disposeError) { console.warn('Partial WebGPU engine could not be disposed', disposeError); } engine = null; }
    }
    if (!engine) { engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, adaptToDeviceRatio: true }); $('renderer').textContent = `WEBGL ${engine.webGLVersion}`; }
    scene = new Scene(engine); scene.clearColor = new Color4(.022, .043, .105, 1);
    camera = new ArcRotateCamera('flightCamera', -Math.PI / 2, Math.PI / 2, 30, vec(0, 0, 0), scene);
    camera.mode = 1; camera.inputs.clear(); camera.minZ = .1; camera.maxZ = 100;
    const resize = () => { const ratio = canvas.clientWidth / Math.max(1, canvas.clientHeight); const viewH = Math.max(H, W / ratio); camera.orthoTop = viewH / 2; camera.orthoBottom = -viewH / 2; camera.orthoLeft = -viewH * ratio / 2; camera.orthoRight = viewH * ratio / 2; engine.resize(); };
    window.addEventListener('resize', resize); resize();
    new HemisphericLight('ambient', vec(0, 0, -1), scene).intensity = .65;
    const keyLight = new DirectionalLight('key', vec(-.35, -.6, 1), scene); keyLight.intensity = 1.4;
    const glow = new GlowLayer('neonGlow', scene); glow.intensity = .38;
    mats = {
      playerBody: material('ceramic-white', '#a6c8de'), playerEdge: material('cyan-alloy', '#376785', '#123b54'),
      enemyBody: material('enemy-armor', '#85365b'), enemyEdge: material('enemy-edge', '#c75a75', '#54112a'),
      bossBody: material('boss-armor', '#5d2542'), bossEdge: material('boss-plating', '#a83b61'),
      glass: material('canopy', '#174968', '#2dc8e5'), glassRed: material('boss-bridge', '#481033', '#e23c70'),
      cyan: material('ion-cyan', '#76eeff', '#72eeff'), cyanHalo: material('cyan-halo', '#38d5ff', '#38d5ff', .35),
      red: material('hot-red', '#ff527a', '#fd3c70'), redHalo: material('red-halo', '#ff496c', '#ff496c', .38),
      orange: material('hot-orange', '#ffb477', '#ff7040'), gold: material('pickup-gold', '#f9db81', '#e4ab27'),
      green: material('repair-green', '#8df8bb', '#3af49c'), engine: material('engine-metal', '#24283b'),
      rock: material('asteroid-rock', '#4c6380'), mine: material('armed-mine', '#5c4568', '#ae3055')
    };
    const starMats = [material('far-star', '#789abc', '#547eae'), material('near-star', '#b5edff', '#89dbff')];
    for (let i = 0; i < 140; i++) {
      const near = i > 90, m = MeshBuilder.CreateSphere('star', { diameter: near ? rand(.018, .05) : rand(.012, .03), segments: 4 }, scene);
      m.material = starMats[near ? 1 : 0]; m.position = vec(rand(-10.3, 10.3), rand(-5.2, 5.2), near ? 4 : 8);
      stars.push({ mesh: m, speed: near ? rand(.7, 1.5) : rand(.18, .5) });
    }
    const nebulaMat = material('nebula', '#0b2150', '#103878', .11);
    for (let i = 0; i < 8; i++) { const n = MeshBuilder.CreateSphere('nebula-cloud', { diameter: rand(2, 5), segments: 12 }, scene); n.material = nebulaMat; n.position = vec(rand(-9, 9), rand(-4, 4), 10); n.scaling.y = rand(.35, .8); }
    player = ship('nova-wing', 'player', 1); player.position = vec(-6.4, 0, -.2);
    engine.runRenderLoop(() => { update(engine.getDeltaTime() / 1000); scene.render(); });
    window.novaWing2State.ready = true;
    setInterval(() => { Object.assign(window.novaWing2State, { ready: true, phase: game.phase, elapsed: game.elapsed, player: { x: player.position.x, y: player.position.y, hp: game.hp }, score: game.score, enemyCount: enemies.length, bulletCount: bullets.length, bossHp: game.bossSpawned ? game.bossHp : null, bossSpawned: game.bossSpawned, shotsFired: game.shotsFired, renderer: $('renderer').textContent }); }, 250);
  } catch (err) { console.error(err); $('renderer').textContent = 'GPU ERROR'; showBanner('RENDERER <span>ERROR</span>', err.message, 'RETRY'); }
}

window.addEventListener('keydown', e => { if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); keys.add(e.code); if (!e.repeat && e.code === 'KeyP') pause(); if (!e.repeat && e.code === 'KeyR' && player) reset(); });
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); input.fire = input.boost = false; if (game.phase === 'waves' || game.phase === 'boss') pause(); });
$('start').addEventListener('click', () => { if (!player) { location.reload(); return; } if (game.phase === 'paused') pause(); else reset(); });
$('auto-toggle').addEventListener('click', () => { game.autoFire = !game.autoFire; updateHud(); });
$('touch-pause').addEventListener('click', pause);
for (const [id, field] of [['touch-fire', 'fire'], ['touch-boost', 'boost']]) {
  const el = $(id); el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); input[field] = true; });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(event, () => input[field] = false);
}
const stick = $('stick'), knob = $('stick-knob');
function moveStick(e) { const r = stick.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), m = Math.max(1, Math.hypot(dx, dy)), d = Math.min(48, m); input.stickX = dx / m * d / 48; input.stickY = -dy / m * d / 48; knob.style.transform = `translate(${input.stickX * 45}px,${-input.stickY * 45}px)`; }
stick.addEventListener('pointerdown', e => { e.preventDefault(); stick.setPointerCapture(e.pointerId); moveStick(e); });
stick.addEventListener('pointermove', e => { if (stick.hasPointerCapture(e.pointerId)) moveStick(e); });
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(event, () => { input.stickX = input.stickY = 0; knob.style.transform = ''; });

init();
