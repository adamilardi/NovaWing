# Campaign soundtrack

Five 32-bar compositions cover the shared music cues used by levels 2 onward.
Level 1 continues to use its original OGG recordings. The new pieces take their
G/E tonal centers from harmonic analysis of those files; their minor-key motifs
and arrangements are newly composed, not transcriptions. Pulse estimates from
the recordings were ambiguous, so the tempos below are deliberate arrangement
choices, not claims of exact source BPM.

| Game cue | Title | Standard MIDI / sketch WAV | BPM | Key / feel | Loop |
| --- | --- | --- | --- | --- | --- |
| canyon | Crystal Slipstream | `canyonFlight.mid` / `canyonFlight.wav` | 144 | G minor, offbeat bass / four-on-the-floor | 53.33 s |
| canyonBoss | Prism Breaker | `canyonAssault.mid` / `canyonAssault.wav` | 156 | G minor, syncopated kick and bass | 49.23 s |
| singularity | Event Horizon | `eventHorizon.mid` / `eventHorizon.wav` | 92 | E minor, half-time / sustained bass | 83.48 s |
| gauntlet | Escape Velocity | `starRun.mid` / `starRun.wav` | 148 | E minor, rolling bass / sixteenth hats | 51.89 s |
| finalBoss | Core Collapse | `coreCollapse.mid` / `coreCollapse.wav` | 184 | E minor, breakbeat / ghost snares | 41.74 s |

Each loop has an eight-bar opening, an answering phrase, a four-bar breakdown
and rebuild, then a final phrase resolving into the start. Four-on-the-floor
cues intentionally reduce to one kick per bar during the breakdown. MIDI type 1
files use GM synth bass, saw lead, warm pad, square arpeggio, and channel-10 drums.

The game plays the exported note events through its existing Web Audio synth.
It does not require an external MIDI player or soundfont. The same five cues
are reused by later levels according to their existing scene assignments.
`src/music-scores.js` is generated from the MIDI composition; do not edit it by
hand. The old `ddr-*.mid` styles remain available without changed note counts.

Regenerate and validate from the repository root:

```bash
.venv-music/bin/python music/ddr_loop.py --campaign
.venv-music/bin/python music/verify_loops.py
.venv-music/bin/python music/render_preview.py music/canyonFlight.mid
npm run verify:audio
```

Python dependencies: `mido`, `numpy` (preview only). WAV sketches are ignored by
git, reproducible, and exactly loop length, with percussion releases wrapped
across the seam. They use a deliberately simple synth and normalized levels;
they do not reproduce the OGG production or the game's actual mix. Actual
stereo Web Audio renders, including the loop restart, are saved by
`verify:audio` under `.verify-runs/audio-<timestamp>/`. The browser renderer also
checks headroom, finite samples, mute/resume, and scheduler cleanup. MIDI checks
cover exact duration, balanced note-offs, no events beyond the seam, expected
note counts, distinct rhythms, and equality with the game's exported events.
