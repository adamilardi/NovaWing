# Boot and controls

The game loads in a browser, shows the NovaWing canvas, and a desktop player can move the ship with the keyboard or a Standard Gamepad.

## Sub-features

- `boot-load` serves `index.html` and boots Phaser.
- `boot-canvas` shows `#game-container canvas` at a playable size.
- `boot-ready` exposes `__novawingDebug.ready()` and a live bot snapshot.
- `desktop-move` moves the ship with arrow keys.
- `controller` moves, fires, boosts, and pauses from a Standard Gamepad.

## How to get to it (user POV)

- Open the local URL in a desktop browser (default `http://127.0.0.1:4000/`).
- Choose a flight mode and press Launch (click LAUNCH, Space, Enter, A, RT, or Start).
- Hold Arrow Down / S, or the left stick / D-pad down, to move. A first click or pad button also unlocks audio.
- Hold RT / A to fire, LT / B to boost, Start to pause. A second pad is player 2 in local co-op.

## Driving it with verify-novawing

Preconditions:

- Isolated verify server, or `NOVAWING_URL` pointing at a live instance.
- Chromium via Playwright (`scripts/rl/chrome.mjs`).

- **Load.** Run `node scripts/verify-novawing.mjs --case boot`. HTTP status is under 400, `getBotSnapshot().ready` is true, canvas width is over 50, `pageerror` is empty. Screenshot `.verify-runs/<id>/boot.png` shows the playfield.
- **Move.** Run `node scripts/verify-novawing.mjs --case desktop-move`. After Arrow Down for ~280ms, player `y` increases or `vy` is over 20.
- **Pad.** Run `node scripts/verify-novawing.mjs --case controller`. After `setGamepad(0, { axes: [0, 1] })` for ~280ms, player `y` increases or `vy` is over 20. Start toggles pause; RT is fire; LT is boost.

## Gotchas

- Phaser CDN must be reachable; a blocked `cdn.jsdelivr.net` fails boot, not the canvas CSS.
- Touch devices auto-fire and show virtual sticks. Desktop move proof is keyboard only.
- The title overlay swallows movement keys (arrows cycle difficulty). `waitForGame` clicks the canvas so Launch is done before `desktop-move` and `controller`.
- Clicking the canvas unlocks audio. Movement after Launch still works without that click.
- Browsers hide real pads until a button is pressed. The controller case injects a Standard Gamepad through `__novawingDebug.setGamepad`; it does not require hardware.
