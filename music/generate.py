#!/usr/bin/env python3
"""Generate a MIDI loop with Text2midi (AMAAI-Lab) on the local GPU.

Upstream code lives in music/upstream/ (git clone, ignored). Model weights
download from HuggingFace on first run into the HF cache.

Usage from the repo root:
    .venv-music/bin/python music/generate.py --prompt "..." --out music/waves.mid
"""
import argparse
import os
import pickle
import sys

import torch
import torch.nn as nn

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "upstream"))
from model.transformer_model import Transformer  # noqa: E402
from transformers import T5Tokenizer  # noqa: E402
from huggingface_hub import hf_hub_download  # noqa: E402

REPO_ID = "amaai-lab/text2midi"


def pick_device():
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_model(device):
    model_path = hf_hub_download(repo_id=REPO_ID, filename="pytorch_model.bin")
    tokenizer_path = hf_hub_download(repo_id=REPO_ID, filename="vocab_remi.pkl")
    with open(tokenizer_path, "rb") as f:
        r_tokenizer = pickle.load(f)
    vocab_size = len(r_tokenizer)
    print("Vocab size:", vocab_size, flush=True)
    model = Transformer(vocab_size, 768, 8, 2048, 18, 1024, False, 8, device=device)
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.eval()
    tokenizer = T5Tokenizer.from_pretrained("google/flan-t5-base")
    print("Model loaded on", device, flush=True)
    return model, r_tokenizer, tokenizer


def generate(model, r_tokenizer, tokenizer, device, prompt, max_len, temperature):
    inputs = tokenizer(prompt, return_tensors="pt", padding=True, truncation=True)
    input_ids = nn.utils.rnn.pad_sequence(inputs.input_ids, batch_first=True, padding_value=0).to(device)
    attention_mask = nn.utils.rnn.pad_sequence(
        inputs.attention_mask, batch_first=True, padding_value=0).to(device)
    with torch.no_grad():
        output = model.generate(input_ids, attention_mask, max_len=max_len, temperature=temperature)
    return output[0].tolist()


def report(path):
    import mido
    mid = mido.MidiFile(path)
    notes = sum(1 for track in mid.tracks for msg in track
                if msg.type == "note_on" and msg.velocity > 0)
    programs = sorted({msg.program for track in mid.tracks for msg in track
                       if msg.type == "program_change"})
    tempos = [mido.tempo2bpm(msg.tempo) for track in mid.tracks for msg in track
              if msg.type == "set_tempo"] or ["(none)"]
    print(f"Wrote {path}: {len(mid.tracks)} tracks, {notes} notes, "
          f"programs={programs}, tempo_bpm={tempos}, length={mid.length:.1f}s")


def main():
    parser = argparse.ArgumentParser(description="Text-to-MIDI for NovaWing")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--max-len", type=int, default=2000)
    parser.add_argument("--temperature", type=float, default=1.0)
    args = parser.parse_args()

    device = pick_device()
    print("Using device:", device, flush=True)
    model, r_tokenizer, tokenizer = load_model(device)
    print("Generating for prompt:", args.prompt, flush=True)
    tokens = generate(model, r_tokenizer, tokenizer, device,
                      args.prompt, args.max_len, args.temperature)
    generated_midi = r_tokenizer.decode(tokens)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or ".", exist_ok=True)
    generated_midi.dump_midi(args.out)
    report(args.out)


if __name__ == "__main__":
    main()
