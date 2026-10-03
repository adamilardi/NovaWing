---
name: weapon-creator
description: Add or change a player weapon, including how it fires, how the pilot selects it, and how the HUD shows it. Use when introducing a weapon or a way to switch weapons; enemy attacks and boss weapons stay in their own skills.
---

# Weapon creator

Add a player weapon to the running game and prove it in play. Inspect the current weapon ladder, fire path, HUD, co-op pilots, and difficulty rules before editing. Creating a weapon includes local integration and checks. Deployment stays a separate request.

For NovaWing, read [references/novawing.md](references/novawing.md). Do not assume a new rank id or a new button fires until you have traced the existing shot path.

## Keep the ladder, and make the top rank a choice

Lower ranks stay a sequence the pilot climbs with the existing weapon pickup. The top rank is a set of weapons, not a single gun. A new weapon joins that set unless the user asks for another rank on the ladder.

The weapon that already shipped at that rank stays the default selection. Bots and pilots who never switch keep their current shots. Switching is available only at the top rank, once per press, and separately for each pilot. Below the top rank the switch tells the pilot they have not reached it.

Name the selection in the same HUD field as the current weapon. One label is enough.

## Laser burst

Laser is the first weapon added beside Spread. Pressing fire while Laser is selected melts every enemy on screen for 3 seconds, then Laser cannot fire for 3 seconds. Enemies that arrive during those 3 seconds melt too. The boss is not an enemy.

The melt and the recharge use the simulation clock, so pause freezes both. Switching to another top-tier weapon during the recharge lets that weapon fire. Switching back does not skip the remaining recharge. A second Laser burst starts only when the recharge has finished and fire is held again.

A level may hand the pilot a Laser pickup. Collecting it selects Laser at the top rank and refreshes that rank's timer. It leaves a recharge already in progress running, and other levels still start on Spread.

## Wire it through the existing shot

Send the selected weapon through the current fire path. Do not add a second place that spawns the player's attack. Per-pilot state covers local co-op. Register the switch on the keyboard, the gamepad, and the touch controls, and name those controls in the on-screen hint.

Preserve weapon expiry, pickup grants, and lower-rank shots. Do not raise enemy health or change continue rules to make the weapon feel strong.

## Verify in play

Run the project's checks and a production build when the integration touches packaged assets. In the running game, confirm:

- The switch does nothing useful below the top rank, and it cycles the top set once that rank is reached.
- Laser melts an on-screen enemy, leaves the boss in place, and refuses another burst until 3 seconds after the melt.
- The other top-tier weapon still fires during that recharge.
- The HUD names Laser and counts the recharge down. Pause freezes that count.
- Co-op, when the change touches it, switches and fires per pilot.

A debug call can set the rank and read the clock. It does not replace pressing the switch and seeing the burst. Record the command, the observed result, and any path you did not run.
