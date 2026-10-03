# NovaWing weapon integration

Read the current functions. This is an inspection map, not a frozen API.

- Ranks are `MAX_WEAPON_LEVEL` (3): Single, Twin, then the top set. `TOP_TIER_WEAPONS` is `spread` then `laser`. `topTierWeapon` selects Player 1. Player 2 stores `topTierWeapon` on the co-op pilot.
- `LASER_MELT_MS` and `LASER_RECHARGE_MS` are both 3000. `laserState` holds Player 1's `activeUntil` and `readyAt`. Player 2 uses the same fields on that pilot. `updateLaserBursts` draws the beam and melts on-screen enemies. Bosses stay in the `bosses` group.
- `fireBullet` is the only player shot path. Laser returns through `startLaserBurst` before any bullet spawn. Spread and the lower ranks stay in the bullet branch.
- `cycleTopTierWeapon` rejects a switch below the top rank. Q cycles Player 1. Period cycles Player 2 in co-op. Gamepad Y cycles the matching pilot during play. The touch dock button is `data-touch="weapon"`.
- `getWeaponName` and `updateWeaponText` own the HUD label. Supernova rank expiry still uses `weaponCharges` and `weaponPowerMs`. Laser recharge is a separate countdown.
- `window.__novawingDebug.debugWeaponState` reports `weaponId`, `laserActiveMs`, and `laserRechargeMs`. `debugLaserProbe` exercises the rank gate, melt, recharge, and the return to Spread.
- Playtest new weapon behavior on Supernova (`diff=hard`). The entry rules live in [the level authoring reference](../../level-creator/references/novawing.md#required-default-balance-and-playtest-rules).

Run `npm run check`. For this weapon, `node scripts/verify-novawing.mjs --case laser` presses Q and Space and reads the burst. A `bot` URL forces Hotshot, so it does not prove Supernova.
