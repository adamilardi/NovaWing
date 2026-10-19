/**
 * Boss-gun discipline shared by the playbots (simple + JEV).
 *
 * The laser melts on-screen adds but never damages bosses: while it is
 * equipped, fireBullet() routes into startLaserBurst() and launches zero
 * projectiles (game.js updateLaserBursts only draws the beam and clears
 * the adds group). A bot that enters a boss phase with the laser equipped
 * therefore cannot win — every baseline boss timeout showed LASER on the
 * HUD with the boss at full HP. Humans press Q (cycleTopTierWeapon) to
 * swap to a real boss gun; bots do the same through chooseBossGun().
 */

// Mirrors game.js TOP_TIER_WEAPONS (game.js:134); Q cycles forward.
export const TOP_TIER_ORDER = ['spread', 'laser', 'torrent'];
// Mirrors game.js MAX_WEAPON_LEVEL (game.js:131).
export const MAX_WEAPON_RANK = 3;
// Spread's fan chips the boss even while the bot dodges; torrent's
// tight line also wins. Only boss-immune guns must move.
export const BOSS_GUN = 'spread';
// Guns that cannot damage bosses at all (laser melts adds only).
export const BOSS_IMMUNE_GUNS = ['laser'];

/**
 * How many Q-swaps (cycleTopTierWeapon calls) the bot should press on
 * entering a boss fight. 0 = hold the current gun. Only proven-fatal
 * guns move — winning guns are left alone. Pure: safe to unit-test
 * and to call from either bot's Node lifecycle.
 */
export function chooseBossGun({ gun, rank } = {}) {
    if (!Number.isFinite(rank) || rank < MAX_WEAPON_RANK) return 0;
    if (!BOSS_IMMUNE_GUNS.includes(gun)) return 0;
    const from = TOP_TIER_ORDER.indexOf(gun);
    if (from === -1) return 0;
    const to = TOP_TIER_ORDER.indexOf(BOSS_GUN);
    return (to - from + TOP_TIER_ORDER.length) % TOP_TIER_ORDER.length;
}
