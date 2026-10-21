#!/usr/bin/env python3
"""Compose a seamless techno/DDR game loop as MIDI. Pattern music is
composed, not guessed: four-on-the-floor, 16th bass, supersaw stabs,
exact bar math so the loop seam is sample-tight.

Usage from the repo root:
    .venv-music/bin/python music/ddr_loop.py --out music/ddr-waves.mid
"""
import argparse

import mido

PPQ = 480
BEAT = PPQ
BAR = 4 * PPQ

# A-minor drum + instrument map (GM).
KICK, SNARE, CLAP = 36, 38, 39
CLOSED_HAT, OPEN_HAT, CRASH, RIDE_BELL = 42, 46, 49, 53
BASS_PROG, LEAD_PROG, PAD_PROG, ARP_PROG = 38, 81, 88, 80

# Chord roots as MIDI notes (bass octave), 2-bar phrases over 8 bars.
WAVES_PROG = [33, 33, 29, 31]  # Am Am F G
WAVES_CHORDS = [  # pad voicings, one per 2 bars
    [57, 60, 64],  # Am
    [57, 60, 64],  # Am
    [53, 57, 60],  # F
    [55, 59, 62],  # G
]
# 2-bar lead riff (16th steps -> note or None), A minor, stabby.
WAVES_RIFF = [
    69, None, None, 69, None, None, 72, None, 76, None, 74, None, 72, None, 74, None,
    76, None, None, 76, None, 79, None, 76, 74, None, 72, None, 74, None, None, None,
]

# Boss: same key, darker turn (E major sting), relentless 16th lead.
BOSS_PROG = [33, 33, 29, 28]  # Am Am F E
BOSS_CHORDS = [
    [57, 60, 64],  # Am
    [57, 60, 64],  # Am
    [53, 57, 60],  # F
    [52, 56, 59],  # E (G# menace)
]
BOSS_RIFF = [
    69, 69, 72, 69, 76, 76, 74, 72, 74, 74, 76, 79, 81, 79, 76, 74,
    76, 76, 74, 72, 74, 72, 69, 69, 71, 72, 74, 76, 74, 72, 71, 69,
]

# Canyon: D-minor groove, spacious. Boss version drives without the break.
CANYON_PROG = [38, 38, 34, 36]  # Dm Dm Bb C
CANYON_CHORDS = [
    [50, 53, 57],  # Dm
    [50, 53, 57],  # Dm
    [46, 50, 53],  # Bb
    [48, 52, 55],  # C
]
CANYON_RIFF = [
    62, None, None, 62, None, None, 65, None, 69, None, 67, None, 65, None, 64, None,
    62, None, None, 62, None, 65, None, 67, 69, None, 67, None, 65, 64, 62, None,
]
CANYONBOSS_RIFF = [
    62, 62, 65, 62, 69, 69, 67, 65, 67, 67, 69, 72, 74, 72, 69, 67,
    69, 69, 67, 65, 67, 65, 62, 62, 64, 65, 67, 69, 67, 65, 64, 62,
]

# Singularity: E-minor dread, mid-track dip, long build out of it.
SING_PROG = [40, 40, 36, 38]  # Em Em C D
SING_CHORDS = [
    [52, 55, 59],  # Em
    [52, 55, 59],  # Em
    [48, 52, 55],  # C
    [50, 54, 57],  # D
]
SING_RIFF = [
    64, None, None, 64, None, None, 67, None, 71, None, 69, None, 67, None, 66, None,
    71, None, 69, None, 67, None, 66, None, 64, None, 62, None, 59, None, None, None,
]

# Gauntlet: A-minor peak energy, fastest lead runs in the set.
GAUNTLET_RIFF = [
    69, 72, 76, 79, 81, 79, 76, 74, 76, 74, 72, 74, 69, 72, 74, 76,
    79, 81, 79, 76, 74, 76, 72, 74, 69, 72, 74, 76, 79, 81, 84, 81,
]

# Final boss: E minor with a B-major sting, everything at full throttle.
FINAL_PROG = [40, 40, 36, 35]  # Em Em C B
FINAL_CHORDS = [
    [52, 55, 59],  # Em
    [52, 55, 59],  # Em
    [48, 52, 55],  # C
    [47, 51, 54],  # B (D# menace)
]
FINAL_RIFF = [
    64, 64, 67, 71, 76, 71, 67, 66, 64, 64, 67, 71, 76, 79, 78, 76,
    74, 74, 71, 69, 67, 69, 71, 74, 71, 69, 67, 66, 64, 62, 64, None,
]

STYLES = {
    # hard: kick rolls + snare layers + hotter arp. lead_up/bass_down: octaves.
    # kick: four|half (+doubles). snare: backbeat|half. hats: t16|shuffle|ride|
    # sparse8. bass: roll|offbeat|acid|long. Sibling tracks must differ in
    # feel, never just BPM/key.
    "waves": {"prog": WAVES_PROG, "chords": WAVES_CHORDS, "riff": WAVES_RIFF,
              "break_bar": 6, "build_beats": 0.5, "crash_bars": (0,),
              "bpm": 150.0, "hard": False, "lead_up": False, "bass_down": False,
              "kick": "four", "doubles": False, "snare": "backbeat",
              "hats": "t16", "swing": 0.0, "bass": "roll"},
    "boss": {"prog": BOSS_PROG, "chords": BOSS_CHORDS, "riff": BOSS_RIFF,
             "break_bar": None, "build_beats": 1.0, "crash_bars": (0, 4),
             "bpm": 160.0, "hard": True, "lead_up": True, "bass_down": True,
             "kick": "four", "doubles": False, "snare": "backbeat",
             "hats": "t16", "swing": 0.0, "bass": "roll"},
    "canyon": {"prog": CANYON_PROG, "chords": CANYON_CHORDS, "riff": CANYON_RIFF,
               "break_bar": 6, "build_beats": 0.5, "crash_bars": (0,),
               "bpm": 148.0, "hard": False, "lead_up": False, "bass_down": False,
               "kick": "four", "doubles": False, "snare": "backbeat",
               "hats": "shuffle", "swing": 0.12, "bass": "offbeat"},
    "canyonBoss": {"prog": CANYON_PROG, "chords": CANYON_CHORDS, "riff": CANYONBOSS_RIFF,
                   "break_bar": None, "build_beats": 1.0, "crash_bars": (0, 4),
                   "bpm": 160.0, "hard": True, "lead_up": False, "bass_down": False,
                   "kick": "four", "doubles": False, "snare": "backbeat",
                   "hats": "ride", "swing": 0.0, "bass": "acid"},
    "singularity": {"prog": SING_PROG, "chords": SING_CHORDS, "riff": SING_RIFF,
                    "break_bar": 4, "build_beats": 1.0, "crash_bars": (0,),
                    "bpm": 145.0, "hard": True, "lead_up": False, "bass_down": False,
                    "kick": "half", "doubles": False, "snare": "half",
                    "hats": "sparse8", "swing": 0.0, "bass": "long"},
    "gauntlet": {"prog": WAVES_PROG, "chords": WAVES_CHORDS, "riff": GAUNTLET_RIFF,
                 "break_bar": None, "build_beats": 1.0, "crash_bars": (0, 4),
                 "bpm": 165.0, "hard": True, "lead_up": False, "bass_down": False,
                 "kick": "four", "doubles": True, "snare": "backbeat",
                 "hats": "t16", "swing": 0.0, "bass": "acid"},
    "finalBoss": {"prog": FINAL_PROG, "chords": FINAL_CHORDS, "riff": FINAL_RIFF,
                  "break_bar": None, "build_beats": 1.0, "crash_bars": (0, 2, 4, 6),
                  "bpm": 168.0, "hard": True, "lead_up": True, "bass_down": False,
                  "kick": "four", "doubles": True, "snare": "backbeat",
                  "hats": "ride", "swing": 0.0, "bass": "acid"},
}


def track(mid, name, channel, program=None, drums=False):
    track = mido.MidiTrack()
    track.append(mido.MetaMessage("track_name", name=name, time=0))
    if program is not None and not drums:
        track.append(mido.Message("program_change", program=program, channel=channel, time=0))
    mid.tracks.append(track)
    return track


def notes(track, channel, events):
    """events: (start_tick, length_tick, note, velocity). Emits sorted delta-time."""
    ordered = []
    for start, length, note, vel in events:
        ordered.append((start, mido.Message("note_on", note=note, velocity=vel, channel=channel)))
        ordered.append((start + length, mido.Message("note_off", note=note, velocity=0, channel=channel)))
    ordered.sort(key=lambda item: item[0])
    last = 0
    for tick, msg in ordered:
        msg.time = tick - last
        last = tick
        track.append(msg)


def compose(bpm, bars, style="waves"):
    cfg = STYLES[style]
    prog, chords, riff = cfg["prog"], cfg["chords"], cfg["riff"]
    break_bar, build_beats = cfg["break_bar"], cfg["build_beats"]
    hard, lead_up, bass_down = cfg["hard"], cfg["lead_up"], cfg["bass_down"]
    kick_style, doubles = cfg["kick"], cfg["doubles"]
    snare_style, hat_style = cfg["snare"], cfg["hats"]
    swing, bass_style = cfg["swing"], cfg["bass"]
    mid = mido.MidiFile(type=1, ticks_per_beat=PPQ)
    meta = mido.MidiTrack()
    meta.append(mido.MetaMessage("track_name", name="meta", time=0))
    meta.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(bpm), time=0))
    meta.append(mido.MetaMessage("time_signature", numerator=4, denominator=4, time=0))
    mid.tracks.append(meta)

    sixteenth = PPQ // 4
    end = bars * BAR

    # Kick: four on the floor, half-time stomp, optional doubles + rolls.
    kick = track(mid, "kick", 9, drums=True)
    kick_ev = []
    for bar in range(bars):
        if kick_style == "half":
            kick_ev.append((bar * BAR, BEAT // 2, KICK, 127))
            kick_ev.append((bar * BAR + 2 * BEAT + BEAT // 2, sixteenth * 2, KICK, 112))
        else:
            for beat in range(4):
                kick_ev.append((bar * BAR + beat * BEAT, BEAT // 2, KICK, 127 if beat == 0 else 120))
            if doubles and bar < bars - 1:
                kick_ev.append((bar * BAR + 14 * sixteenth, sixteenth, KICK, 116))
                kick_ev.append((bar * BAR + 15 * sixteenth, sixteenth, KICK, 116))
            if doubles and bar == bars - 1:
                kick_ev.append((bar * BAR + 14 * sixteenth, sixteenth, KICK, 116))
            if hard and kick_style == "four" and bar in (3, 7):
                for step in range(12, 14 if doubles else 16):
                    kick_ev.append((bar * BAR + step * sixteenth, sixteenth, KICK, 112))
    kick_ev.append((end - sixteenth, sixteenth, KICK, 120))
    notes(kick, 9, kick_ev)

    # Hats: closed 16ths + open offbeat 8ths.
    hats = track(mid, "hats", 9, drums=True)
    hat_ev = []
    shift = int(swing * sixteenth)
    for bar in range(bars):
        for step in range(16):
            tick = bar * BAR + step * sixteenth + (shift if step % 2 else 0)
            if hat_style == "sparse8":
                if step % 2:
                    continue
                if step in (4, 12):
                    hat_ev.append((tick, sixteenth * 2, OPEN_HAT, 108))
                else:
                    hat_ev.append((tick, sixteenth // 2, CLOSED_HAT, 80))
            elif hat_style == "ride":
                if step % 2:
                    continue
                hat_ev.append((tick, sixteenth // 2, CLOSED_HAT, 84))
                if step % 4 == 0:
                    hat_ev.append((tick, sixteenth * 2, RIDE_BELL, 92))
                else:
                    hat_ev.append((tick, sixteenth * 2, OPEN_HAT, 105))
            else:  # t16 + shuffle: closed 16ths, open offbeats
                vel = 100 if step % 4 == 2 else (70 if step % 2 else 88)
                hat_ev.append((tick, sixteenth // 2, CLOSED_HAT, vel))
                if step % 4 == 2:
                    hat_ev.append((tick, sixteenth * 2, OPEN_HAT, 105))
    notes(hats, 9, hat_ev)

    # Clap on 2 + 4 (boss layers snare), crash hits, snare roll into the seam.
    perc = track(mid, "perc", 9, drums=True)
    perc_ev = [(bar * BAR, BEAT // 2, CRASH, 115) for bar in cfg["crash_bars"]]
    for bar in range(bars):
        if snare_style == "half":
            perc_ev.append((bar * BAR + 2 * BEAT, BEAT // 2, SNARE, 122))
            continue
        perc_ev.append((bar * BAR + 1 * BEAT, BEAT // 2, CLAP, 112))
        perc_ev.append((bar * BAR + 3 * BEAT, BEAT // 2, CLAP, 112))
        if hard:
            perc_ev.append((bar * BAR + 1 * BEAT, BEAT // 2, SNARE, 104))
            perc_ev.append((bar * BAR + 3 * BEAT, BEAT // 2, SNARE, 104))
    build_ticks = int(build_beats * BEAT)
    steps = build_ticks // (BEAT // 16)
    for i in range(steps):  # 32nd roll, crescendo to the seam
        tick = end - build_ticks + i * (BEAT // 16)
        perc_ev.append((tick, BEAT // 16, SNARE, 80 + int(i * 47 / max(1, steps - 1))))
    notes(perc, 9, perc_ev)

    # Bass: rolling 16ths, octave pops, follows the Am Am F G phrase.
    bass = track(mid, "bass", 1, BASS_PROG)
    bass_ev = []
    acid_jumps = {2: 12, 4: 7, 6: 12, 7: 10, 11: 12, 12: 7, 14: 12}
    for bar in range(bars):
        root = prog[(bar // 2) % 4] - (12 if bass_down else 0)
        broken = bar == break_bar
        if bass_style == "long":
            bass_ev.append((bar * BAR, 2 * BEAT, root, 120))
            if not broken:
                bass_ev.append((bar * BAR + 2 * BEAT, 2 * BEAT, root + 7, 116))
            continue
        steps = (2, 6, 10, 14) if bass_style == "offbeat" else range(16)
        for step in steps:
            if broken and step >= 8:
                continue  # mini-break: drop the second half of the break bar
            tick = bar * BAR + step * sixteenth
            if bass_style == "offbeat":
                note = root + (12 if step == 10 else 0)
                bass_ev.append((tick, int(sixteenth * 1.8), note, 112))
            elif bass_style == "acid":
                note = root + acid_jumps.get(step, 0)
                vel = 124 if step in (0, 6, 11) else 106
                bass_ev.append((tick, int(sixteenth * 0.9), note, vel))
            else:  # roll
                note = root + (12 if step % 8 == 6 else 0) + (7 if step % 16 == 14 else 0)
                vel = 122 if step % 4 == 0 else (108 if hard else 100)
                bass_ev.append((tick, int(sixteenth * 0.9), note, vel))
    notes(bass, 1, bass_ev)

    # Lead: 2-bar stab riff, silent during the bar-7 break.
    lead = track(mid, "lead", 2, LEAD_PROG)
    lead_ev = []
    for bar in range(bars):
        if bar == break_bar:
            continue
        for step in range(16):
            note = riff[(bar % 2) * 16 + step]
            if note is None:
                continue
            lead_ev.append((bar * BAR + step * sixteenth, int(sixteenth * 0.85),
                            note + (12 if lead_up else 0), 112 if hard else 108))
    notes(lead, 2, lead_ev)

    # Pad: whole-note chords per 2 bars.
    pad = track(mid, "pad", 3, PAD_PROG)
    pad_ev = []
    for phrase in range(bars // 2):
        for note in chords[phrase % 4]:
            pad_ev.append((phrase * 2 * BAR, 2 * BAR, note, 72))
    notes(pad, 3, pad_ev)

    # Arp: 16th chord arpeggio two octaves up, quiet sparkle.
    arp = track(mid, "arp", 4, ARP_PROG)
    arp_ev = []
    for bar in range(bars):
        if bar == break_bar:
            continue
        chord = [n + 24 for n in chords[(bar // 2) % 4]]
        for step in range(16):
            note = chord[step % len(chord)] + (12 if (step // len(chord)) % 2 else 0)
            arp_ev.append((bar * BAR + step * sixteenth, int(sixteenth * 0.8), note, 84 if hard else 76))
    notes(arp, 4, arp_ev)

    return mid


def main():
    parser = argparse.ArgumentParser(description="Compose a DDR game loop")
    parser.add_argument("--out", default=None)
    parser.add_argument("--bpm", type=float, default=None)
    parser.add_argument("--bars", type=int, default=8)
    parser.add_argument("--style", choices=list(STYLES), default="waves")
    args = parser.parse_args()
    bpm = args.bpm if args.bpm else STYLES[args.style]["bpm"]
    out = args.out if args.out else f"music/ddr-{args.style}.mid"
    mid = compose(bpm, args.bars, args.style)
    mid.save(out)
    got = sum(1 for t in mid.tracks for m in t if m.type == "note_on" and m.velocity > 0)
    print(f"Wrote {out}: {args.style} style, {args.bars} bars at {bpm} BPM, "
          f"{len(mid.tracks)} tracks, {got} notes, {mid.length:.2f}s "
          f"(exact loop: {args.bars * 4 * 60 / bpm:.2f}s)")


if __name__ == "__main__":
    main()
