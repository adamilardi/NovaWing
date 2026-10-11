// Campaign pressure report: per-segment scores and roles per mode.
const Levels = require('../levels.js');

const MODES = process.argv[2] ? [process.argv[2]] : ['easy', 'normal', 'hard'];
const GLYPH = { breather: '~', standard: '=', chaos: '#' };

for (const mode of MODES) {
    console.log(`--- ${mode} ---`);
    for (const level of Levels.getEffectiveLevelDefs()) {
        const curve = Levels.scoreLevelCurve(level, mode);
        const timeline = curve.segments.map(s => GLYPH[s.role] || '?').join('');
        const detail = curve.segments.map(s => `${s.id}:${s.score}`).join(' ');
        console.log(`L${level.id} ${level.name} mean=${curve.mean} peak=${curve.peak} [${timeline}] ${detail}`);
    }
}
