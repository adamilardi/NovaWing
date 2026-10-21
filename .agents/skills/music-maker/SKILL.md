---
name: music-maker
description: Compose seamless game-music loops as MIDI, choosing composed patterns over AI generation for dance music and verifying every loop.
---

# Music Maker

Make background-music loops for games as MIDI files. Learned the hard way:
for pattern music (techno, DDR, dance), composing in code beats AI
generation every time. Use AI models only for melodic exploration.

## Method ranking

1. **Compose in code (default for dance/techno).** Write the loop as a
   generator script (mido) with exact bar math. Exact BPM, seamless seam,
   every part tweakable in seconds. This is what shipped the approved
   tracks.
2. **Text2MIDI on the local GPU (ideas only).** Prompt-to-MIDI
   (`music/generate.py`, Text2MIDI + `.venv-music`). Good for exploring
   melodies; expect prompt drift (wrong key, default ~121 BPM tempo),
   weak drums, and no loop structure. Curate heavily, never ship raw.
3. **Avoid for loopable game MIDI.** Magenta (TensorFlow install pain,
   Ableton-only Studio v2, short monophonic ideas) and Suno/Udio
   (audio-only: cannot loop-fit or re-voice).

A GPU is optional for MIDI work. The small symbolic models run on CPU;
CUDA just makes Text2MIDI takes faster (~3 min on an RTX 5070).

## Project rig (NovaWing)

- Env: `.venv-music/` (Python 3.10, uv). Torch cu128 from cache.
  Verify GPU with `torch.cuda.is_available()` before generating.
- `music/ddr_loop.py --style <track> [--bpm N]` — the composed loop
  generator. Add new tracks as styles, never as one-off scripts.
  Sibling tracks must differ in drum/bass feel (kick, hats, snare,
  bass patterns), never just BPM/key/riff — same template in a new
  key reads as one track, not a soundtrack.
- `music/generate.py --prompt ... --out ...` — Text2MIDI wrapper.
- `music/render_preview.py <file.mid>` — MIDI to WAV sketch for
  listening. Judge composition, not sound design.
- Upstream model code lives in `music/upstream/` (gitignored clone).
  Commit wrappers, styles, and approved MIDIs only.

## Loop contract (verify every track)

- Total length is exactly `bars * 4 * 60 / BPM` seconds.
- Zero note-on events at or past the loop end tick.
- Tempo is forced in the file; never trust a model's tempo event.
- Kicks on every beat for four-on-the-floor; count them.
- Builds (snare rolls, pickups) resolve exactly at the seam so the
  loop restarts musically.
- Regression: re-rendering an approved style must reproduce its note
  count exactly.

## Workflow

1. Ask which track (waves, boss, ...) and lock BPM/key first.
2. Compose, render preview, run the loop-contract checks.
3. Hand the user the WAV + MIDI paths and an honest read (what the
   preview synth hides, any drift from the brief).
4. Iterate on their feedback in code; keep takes as `music/<track>.mid`
   once approved, experiments as `music/<track>-takeN.mid`.
