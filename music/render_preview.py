#!/usr/bin/env python3
"""Crude but listenable WAV preview of a MIDI file (no FluidSynth needed).

Renders each note as a harmonic stack with an ADSR envelope; timbre is
picked from the GM program family. Drums (channel 9) become filtered
noise bursts. Good enough to judge composition, not production sound.

Usage from the repo root:
    .venv-music/bin/python music/render_preview.py music/waves-take1.mid
"""
import math
import sys
import wave

import mido
import numpy as np

RATE = 22050


def family_timbre(program):
    if program is None:
        return (1.0, 0.3, 0.1)
    group = program // 8
    return {
        0: (1.0, 0.35, 0.12),   # piano
        1: (1.0, 0.25, 0.08),   # chromatic
        2: (1.0, 0.15, 0.05),   # organ
        3: (1.0, 0.4, 0.2),     # guitar
        4: (1.0, 0.5, 0.25),    # bass
        5: (1.0, 0.2, 0.06),    # strings
        6: (1.0, 0.2, 0.06),    # ensemble
        7: (1.0, 0.45, 0.2),    # brass
        8: (1.0, 0.3, 0.1),     # reed
        9: (1.0, 0.25, 0.08),   # pipe
        10: (1.0, 0.5, 0.3),    # synth lead
        11: (1.0, 0.3, 0.1),    # synth pad
        12: (1.0, 0.4, 0.15),   # synth fx
        13: (1.0, 0.3, 0.1),    # ethnic
        14: (1.0, 0.3, 0.1),    # percussive
        15: (1.0, 0.25, 0.08),  # sfx
    }.get(group, (1.0, 0.3, 0.1))


def adsr(length, attack=0.01, decay=0.08, sustain=0.6, release=0.12):
    n = max(1, int(length * RATE))
    env = np.ones(n) * sustain
    a = min(n, max(1, int(attack * RATE)))
    d = min(n - a, max(1, int(decay * RATE)))
    r = min(n - a - d, max(1, int(release * RATE)))
    env[:a] = np.linspace(0, 1, a)
    env[a:a + d] = np.linspace(1, sustain, d)
    if r > 0:
        env[n - r:] = np.linspace(env[n - r], 0, r)
    return env


def render_note(freq, start, length, velocity, timbre):
    n = max(1, int(length * RATE))
    t = np.arange(n) / RATE
    wave_sum = np.zeros(n)
    for harmonic, amp in enumerate(timbre, start=1):
        wave_sum += amp * np.sin(2 * math.pi * freq * harmonic * t)
    wave_sum *= adsr(length) * (velocity / 127.0) * 0.5
    return start, wave_sum


def render_drum(note, start, length, velocity):
    amp = (velocity / 127.0)
    if note in (35, 36):  # kick: sine pitch drop 150 -> 48 Hz
        dur = min(max(length, 0.22), 0.35)
        n = max(1, int(dur * RATE))
        t = np.arange(n) / RATE
        freq = 48.0 + (150.0 - 48.0) * np.exp(-t * 28.0)
        phase = np.cumsum(2 * math.pi * freq / RATE)
        sig = np.sin(phase) * np.exp(-t * 9.0) * amp * 0.9
        return start, sig
    if note in (38, 40):  # snare: noise + 190 Hz body
        dur = min(max(length, 0.16), 0.25)
        n = max(1, int(dur * RATE))
        t = np.arange(n) / RATE
        sig = (np.random.uniform(-1, 1, n) * 0.6
               + np.sin(2 * math.pi * 190.0 * t) * 0.5)
        sig *= np.exp(-t * 22.0) * amp * 0.7
        return start, sig
    if note == 39:  # clap: 3 quick noise bursts
        dur = min(max(length, 0.18), 0.3)
        n = max(1, int(dur * RATE))
        sig = np.zeros(n)
        for offset_ms in (0, 18, 36):
            i = int(offset_ms / 1000 * RATE)
            burst = np.random.uniform(-1, 1, max(1, n - i))
            sig[i:] += burst * np.exp(-np.arange(n - i) / RATE * 30.0) * 0.4
        sig *= amp * 0.7
        return start, sig
    if note in (42, 44):  # closed hat: short bright tick
        n = max(1, int(0.05 * RATE))
        sig = np.random.uniform(-1, 1, n)
        sig[1:] -= 0.96 * sig[:-1]  # crude highpass
        sig *= np.exp(-np.arange(n) / RATE * 120.0) * amp * 0.45
        return start, sig
    if note in (46, 51, 52, 53, 59):  # open hat / ride: longer sizzle
        n = max(1, int(0.35 * RATE))
        sig = np.random.uniform(-1, 1, n)
        sig[1:] -= 0.96 * sig[:-1]
        sig *= np.exp(-np.arange(n) / RATE * 12.0) * amp * 0.4
        return start, sig
    # crash + toms + anything else: noise wash
    dur = min(max(length, 0.8), 1.5) if note in (49, 57) else min(max(length, 0.2), 0.4)
    n = max(1, int(dur * RATE))
    sig = np.random.uniform(-1, 1, n) * np.exp(-np.arange(n) / RATE * 4.0) * amp * 0.5
    return start, sig


def main():
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else src.rsplit(".", 1)[0] + ".wav"
    mid = mido.MidiFile(src)

    tempo_map = [(0, 500000)]
    for track in mid.tracks:
        abs_tick = 0
        for msg in track:
            abs_tick += msg.time
            if msg.type == "set_tempo":
                tempo_map.append((abs_tick, msg.tempo))
    tempo_map.sort()

    def tick_to_sec(tick):
        total, last_tick, tempo = 0.0, 0, tempo_map[0][1]
        for change_tick, change_tempo in tempo_map[1:] + [(tick, None)]:
            span = min(tick, change_tick) - last_tick
            if span > 0:
                total += mido.tick2second(span, mid.ticks_per_beat, tempo)
                last_tick = min(tick, change_tick)
            if change_tick >= tick:
                break
            tempo = change_tempo
        return total

    events = []  # (start, end, note, velocity, channel, program)
    for track in mid.tracks:
        abs_tick = 0
        program = 0
        open_notes = {}
        for msg in track:
            abs_tick += msg.time
            abs_time = tick_to_sec(abs_tick)
            if msg.type == "program_change":
                program = msg.program
            elif msg.type == "note_on" and msg.velocity > 0:
                open_notes[msg.note] = (abs_time, msg.velocity, msg.channel, program)
            elif msg.type in ("note_off",) or (msg.type == "note_on" and msg.velocity == 0):
                if msg.note in open_notes:
                    start, vel, ch, prog = open_notes.pop(msg.note)
                    events.append((start, max(abs_time, start + 0.05), msg.note, vel, ch, prog))
    for note, (start, vel, ch, prog) in open_notes.items():
        events.append((start, start + 0.4, note, vel, ch, prog))

    total = max((end for _, end, _, _, _, _ in events), default=1.0) + 0.5
    mix = np.zeros(int(total * RATE) + RATE)
    for start, end, note, vel, ch, prog in events:
        freq = 440.0 * 2 ** ((note - 69) / 12.0)
        if ch == 9:
            pos, sig = render_drum(note, start, end - start, vel)
        else:
            pos, sig = render_note(freq, start, end - start, vel, family_timbre(prog))
        i = int(pos * RATE)
        mix[i:i + len(sig)] += sig[:len(mix) - i]

    peak = np.abs(mix).max()
    if peak > 0:
        mix = mix / peak * 0.89
    with wave.open(dst, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes((mix * 32767).astype(np.int16).tobytes())
    print(f"Wrote {dst}: {len(events)} notes, {total:.1f}s")


if __name__ == "__main__":
    main()
