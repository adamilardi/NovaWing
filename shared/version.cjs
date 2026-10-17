/**
 * Single source of truth for the NovaWing release version (leaderboard scope).
 *
 * The version lives in package.json. The Node server and the Pages Functions
 * endpoints derive it through this module (the Functions bundler inlines the
 * package.json require at deploy time). game.js keeps a test-enforced mirror
 * because the browser bundle cannot require package.json.
 */
const { version: GAME_VERSION } = require('../package.json');

function sanitizeGameVersion(value) {
    const cleaned = String(value || '')
        .replace(/[^\w.-]/g, '')
        .trim()
        .slice(0, 24);

    return cleaned || GAME_VERSION;
}

module.exports = { GAME_VERSION, sanitizeGameVersion };
