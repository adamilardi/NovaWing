# Boot and controls

The game loads in a browser, shows the NovaWing canvas, and a desktop player can move the ship with the keyboard.

## Sub-features

- `boot-load` serves `index.html` and boots Phaser.
- `boot-canvas` shows `#game-container canvas` at a playable size.
- `boot-ready` exposes `__novawingDebug.ready()` and a live bot snapshot.
- `desktop-move` moves the ship with arrow keys.

## How to get to it (user POV)

- Open the local URL in a desktop browser (default `http://127.0.0.1:4000/`).
- Click or tap the canvas once to unlock audio.
- Hold Arrow Down / S to move.

## Driving it with verify-novawing

Preconditions:

- Isolated verify server, or `NOVAWING_URL` pointing at a live instance.
- Chromium via Playwright (`scripts/rl/chrome.mjs`).

- **Load.** Run `node scripts/verify-novawing.mjs --case boot`. HTTP status is under 400, `getBotSnapshot().ready` is true, canvas width is over 50, `pageerror` is empty. Screenshot `.verify-runs/<id>/boot.png` shows the playfield.
- **Move.** Run `node scripts/verify-novawing.mjs --case desktop-move`. After Arrow Down for ~280ms, player `y` increases or `vy` is over 20.

## Gotchas

- Phaser CDN must be reachable; a blocked `cdn.jsdelivr.net` fails boot, not the canvas CSS.
- Touch devices auto-fire and show virtual sticks. Desktop move proof is keyboard only.
- Clicking the canvas is required before some audio paths; movement still works without it.
