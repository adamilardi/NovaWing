# Weapons

The top weapon rank is a choice. Spread stays selected until the pilot switches. Laser melts enemies on screen for 3 seconds, then recharges for 3 seconds.

## How to get to it (user POV)

- Launch a level. Weapon pickups climb Single, then Twin, then the top rank.
- At the top rank, press Q (Period for player 2), gamepad Y, or the touch GUN button. The HUD reads SPREAD or LASER.
- Hold fire on LASER. Enemies on screen melt for 3 seconds. The HUD then counts 3 seconds of recharge. Spread still fires if you switch back during that count.
- Below the top rank the switch says REACH SPREAD TO SWITCH.

## Driving it with verify-novawing

```bash
node scripts/verify-novawing.mjs --case laser
```

The case grants the top rank, checks the locked switch, melts a spawned enemy, checks the 3 second recharge, fires Spread again, presses Q, holds Space, and taps gamepad Y. Screenshot: `.verify-runs/<id>/laser.png`. `pageerror` fails the case.
