# Level 6: Void Cathedral

An obsidian cathedral drifting in a violet void. The player breaches horizontal defenses in the narthex, passes through the existing perspective-shear cinematic, and ascends past risers and orbiters into the nave. A sanctuary section offers recovery before the heart guard and the orbiting Void Heart finale.

Design and selection are delegated by the request. [Selected art](../../art-selections/void-cathedral/selection.json), [preserved original](../../art-candidates/void-cathedral/background.png), and [exact built-in imagegen prompt](../../art-candidates/void-cathedral/prompt.md) remain available. Runtime asset `voidCathedral` is `assets/levels/void-cathedral.webp`, a quality-92 opaque WebP derived from the 1448 × 1086 original. Its arches stay in the background, using 960 × 720 overscan with the existing star parallax. They are decorative and do not create collision geometry.

The roster reuses horizontal regular/interceptor/splitter enemies and the existing vertical dart, riser, strafer, orbiter, and mine-dropping roles used by the selected patterns. The 340-health final boss uses the existing vertical singularity encounter, with a 3500-point reward. The arena's pull and danger radii are authored for this level; shared hazard behavior is preserved.

Progression is narthex 20s → shear 3.5s → ascendingNave 23s → sanctuary 10s → heartGuard 28.5s → finalBoss. Total authored pre-boss time is 85 seconds. The cinematic is silent and leads to upward flight. Recoveries and drops prepare the finale; the black hole is active for the final encounter.

Start locally at `http://localhost:4000/?level=6`. It follows Aurora Passage and now owns the campaign victory route. The level 3 singularity encounter still clears normally, leading into the expansion rather than ending the campaign.

## Verification in progress

Build, syntax checks, and all 61 automated tests pass. Prior desktop/mobile structural checks exercised the selected art, shear/vertical route, all segments, pause, reward, and final victory; the final current-build rerun remains pending. Earlier JEV reports used an incomplete state adapter and modified bot rules. They reached 142 and 14 boss health before defeat, but do not establish excessive player difficulty. Experimental health/recovery changes have been reverted. [The v2 state audit](JEV_STATE_AUDIT.md) now verifies live laser and ring state, engine movement, and the serialized SDK payload. A full replay with the original 340-health boss and ordinary player rules is still required.

Implementation and checks are in `levels.js`, `src/assets.js`, `game.js`, `tests/expansion.test.cjs`, `scripts/verify-expansion.mjs`, and `scripts/jev-play-level.mjs`. No deployment is included.

Initial full-wave JEV evidence: [report](evidence/l6-jev-initial.json). This report explicitly records that the boss clear was not proven.

Tactical full-wave defeat: [report](evidence/l6-jev-tactical-first.json). The isolated browser validation is in [the expansion report](evidence/expansion-browser-report.json), with [desktop](evidence/void-cathedral-desktop.png) and [mobile](evidence/void-cathedral-mobile.png) screenshots.

Second tactical full-wave defeat: [report](evidence/l6-jev-tactical-second.json). It reached 14 boss health and exposed the final-phase damage burst.
