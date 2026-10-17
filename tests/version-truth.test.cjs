/**
 * Version truth contract (package.json + shared/version.cjs + game.js).
 *
 * package.json is the single source of truth for the release version carried
 * as the leaderboard scope. The Node server and Pages Functions derive it via
 * shared/version.cjs; game.js keeps a test-enforced mirror because the
 * browser bundle cannot require package.json.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Version = require('../shared/version.cjs');

const ROOT = path.resolve(__dirname, '..');
const pkg = require('../package.json');

function gameJsVersion() {
    const src = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
    const match = src.match(/^const GAME_VERSION = '([^']+)';/m);
    assert.ok(match, 'game.js must declare const GAME_VERSION');
    return match[1];
}

test('package.json is the single version truth', () => {
    assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'package.json version must be semver');
    assert.equal(Version.GAME_VERSION, pkg.version, 'shared truth must equal package.json');
    assert.equal(gameJsVersion(), pkg.version, 'game.js mirror must equal package.json');
});

test('shared sanitizer defaults to the truth', () => {
    assert.equal(Version.sanitizeGameVersion(''), pkg.version);
    assert.equal(Version.sanitizeGameVersion(undefined), pkg.version);
    assert.equal(Version.sanitizeGameVersion('1.2.1'), '1.2.1');
    assert.equal(Version.sanitizeGameVersion(' 1.2.1 '), '1.2.1');
    assert.equal(Version.sanitizeGameVersion('1.2.1; DROP'), '1.2.1DROP'.slice(0, 24));
});

test('server and functions derive the version instead of hardcoding it', () => {
    for (const file of ['server.js', 'functions/api/leaderboard.js', 'functions/api/run.js']) {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        assert.ok(src.includes('shared/version.cjs'), `${file} must use shared/version.cjs`);
        assert.ok(!src.includes("|| '1.0.0'"), `${file} must not hardcode a version default`);
    }
});
