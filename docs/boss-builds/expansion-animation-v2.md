# Expansion boss animation pass

The existing four bosses retain their original AI-generated artwork and unique behaviors. Animation now renders registered regions of those images as independent parts, instead of stretching an entire sprite and drawing substitute limbs. No new boss design or independently regenerated pose was introduced.

| Boss | Canonical production source | Articulation | Combat response |
| --- | --- | --- | --- |
| Foundry Warden | `assets/bosses/foundry-warden.png` | Original gun regions recoil; reactor shutter regions separate during recovery and close during attack | Leave marked furnace lanes, then fire while the shutters reopen |
| Aurora Sentinel | `assets/bosses/aurora-sentinel.png` | Original crystal wings spread during charge and snap back on release | Read the projected fan angles and move through its two-angle gap |
| Void Cantor | `assets/bosses/void-cantor.png` | Ring sections open; north/south sigils shift during invocation | Move off marked sigil lanes before activation |
| Graveyard Leviathan | `assets/bosses/graveyard-leviathan.png` | Original battery region charges and recoils independently of the hull; keel has small independent drift | In phases 2–3, read the bright battery and use the opposite half of the arena; occasional escorts add pressure |

Original generation sources remain in `art-candidates/expansion-bosses-v1/`. `src/boss-director.js` exposes `parts()` as normalized top-left rectangles and `pose()` as per-state pixel offsets/angles. `game.js` registers those regions as texture frames, retains the hidden original root for collision, and attaches visible parts through the segment lifetime. Scale and registration remain fixed; pivots are region centers and transforms are deliberately small. These are image-part animations, not hand-painted deforming sprite cycles. Future substantial pose changes should use the original full image as a generation reference.

Windup, attack and recovery use the encounter simulation clock. Root position locks from warning through attack so the preview and muzzle origin agree. Core light, fan rays, muzzle charge and sigil accents are separate effects. The original collision body remains on the central hull/core; decorative wings and shutters do not create additional damage bodies.

The Leviathan's phases 2–3 now alternate upper and lower batteries. The upper battery's base angles are 180°, 192°, 204°; the lower battery uses 156°, 168°, 180°. Burst variation retains a five-degree spread around these angles. A bright muzzle and projected rays identify the firing side. This implements the promised alternating-battery mechanic rather than simultaneously covering both sides with one broad spread.

Verification: unit coverage checks source-region coverage, nonoverlap, charge/recoil changes, attack plans, timing, vulnerability and escape lanes. `scripts/verify-bosses.mjs` checks all phases on desktop/mobile, actual projectile creation, original-part articulation, pause including part positions, damage gating, rewards and part/projectile cleanup. These phase checks use debug health changes and invulnerability; full ordinary-rule playthrough evidence is recorded in the companion level report.
