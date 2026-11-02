#!/usr/bin/env python3
"""Check shipped MIDI timing, arrangement diversity, and browser/MIDI parity."""
import json
from pathlib import Path

import mido
from ddr_loop import BAR, PPQ, CAMPAIGN, STYLES, compose, verify_loop

EXPECTED_COUNTS = {
    'canyonFlight': 1025, 'canyonAssault': 1091, 'eventHorizon': 651,
    'starRun': 1343, 'coreCollapse': 1157,
}
source = Path('src/music-scores.js').read_text()
scores = json.loads(source.split('root.NovaWingMusicScores = ', 1)[1].split(';\n', 1)[0])
rhythms = set()
for style, cfg in CAMPAIGN.items():
    mid = mido.MidiFile(f'music/{style}.mid')
    regenerated = compose(cfg['bpm'], 32, style)
    assert verify_loop(mid, 32, cfg['bpm']) == EXPECTED_COUNTS[style]
    assert [list(t) for t in mid.tracks] == [list(t) for t in regenerated.tracks]
    score = scores[cfg['cue']]
    assert score['bars'] == 32 and len(score['steps']) == 512
    assert abs(mid.length - 128 * 60 / score['bpm']) < 1e-7
    exported, kicks = [], set()
    for t in mid.tracks[1:]:
        tick, active = 0, {}
        for msg in t:
            tick += msg.time
            if msg.type == 'note_on' and msg.velocity:
                active[msg.note] = (tick, msg.velocity)
                if t.name == 'drums' and msg.note == 36:
                    kicks.add(tick)
            elif msg.type == 'note_off':
                start, velocity = active.pop(msg.note)
                exported.append((start // (PPQ // 4), t.name, msg.note,
                                 round((tick - start) / PPQ, 4), velocity))
    browser = [(step, *event) for step, events in enumerate(score['steps']) for event in events]
    assert sorted(exported) == sorted(browser), 'MIDI and game notes differ'
    if cfg['feel'] in ('offbeat', 'rolling'):
        for bar in range(32):
            # The four-bar breakdown intentionally drops to one kick per bar.
            beats = (0,) if 16 <= bar < 20 else range(4)
            for beat in beats:
                assert bar * BAR + beat * PPQ in kicks
        assert len(kicks) == 116
    rhythms.add(tuple((step % 16, part, pitch) for step, part, pitch, _, _ in exported
                      if step < 32 and (part == 'bass' or part == 'drums' and pitch == 36)))
    print(f'{style}: {len(exported)} notes; exact loop, balanced notes, game parity PASS')
assert len(rhythms) == len(CAMPAIGN)
for style, cfg in STYLES.items():
    if style in CAMPAIGN:
        continue
    original = mido.MidiFile(f'music/ddr-{style}.mid')
    regenerated = compose(cfg['bpm'], 8, style)
    count = lambda m: sum(msg.type == 'note_on' and msg.velocity > 0
                          for t in m.tracks for msg in t if not msg.is_meta)
    assert count(original) == count(regenerated), style + ': original take changed'
print('Original DDR note-count regressions PASS')
