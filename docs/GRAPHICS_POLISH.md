# Graphics polish — September 10, 2026

- Text uses 2x text textures, lighter HUD outlines, and smooth fractional canvas
  scaling. The game world remains 800×600; this does not increase the renderer's
  full-frame resolution.
- Local co-op has separate cyan/pink pilot panels, lives and weapon labels,
  shield status, boost meters, down-state feedback, and matching on-ship markers.
  Shared score occupies the center panel. Solo HUD remains available in solo mode.
- Single, side/spread, heavy, and hostile shots have distinct silhouettes.
  Friendly shots face their actual velocity, including vertical fire. Short
  trails distinguish P2 and are disabled at low FX quality, shortened on mobile,
  and cleared with the projectile group. Damage and body dimensions are preserved.
- The touch tutorial sits above the landscape control dock.

Validation: build, syntax and whitespace checks; 41 unit tests; browser polish,
local-coop, coop-mode-picker, coop-level-scenarios, combat-polish, pause, and
new graphics-polish checks; 27 mobile checks in Chromium emulation.
The graphics case checks HUD bounds and down state, markers, text resolution,
projectile orientation/damage/body sizes, and trail quality/cleanup. It saves
`graphics-coop-weapons.png` in the verification evidence directory.

These checks do not establish performance on physical phones or a full human
campaign playthrough. Changes are local; no commit or deployment in this pass.
