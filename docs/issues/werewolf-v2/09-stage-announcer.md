# 09: Stage screen with barbell, announcer view

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-widg, ww-ufi7, ww-6pk1

**What to build:** Read-only stage screen: current lifter, team, divisions, bodyweight, attempt number, declared weight, previous attempts, barbell with plates per side. Announcer view: current lifter, next 3–5 with weights, live places in their divisions.

**Blocked by:** 08

**Status:** done

- [x] Verdict appears on both screens as soon as the desk records it
- [x] Barbell drawing matches the plate plan for bar + clamps
- [x] Opens from a read-only link/QR without password

## Verified

- Component tests (`apps/web/src/LiveScreens.test.tsx`): stage shows lifter, weight and a barbell whose plates sum to the loadable plate plan per side and are drawn on both sides (ww-widg); after a verdict both screens show it and the next lifter at once (ww-ufi7, ww-6pk1); the announcer lists the next lifters and the lifter's divisions and places (ww-6pk1).
- Real Chrome against a local Worker (throwaway script): stage and announcer opened in fresh browser contexts from the read-only links, without a password and without a login form. A desk verdict reached both within 36 ms. The stage showed plates 10 + 2.5 per side for 40 kg.
- Tailwind restyle: the stage now has the 2025 layout: contest title, name in spaced mono capitals, one card per attempt with weight and KG, the current attempt framed and glowing, the plate bar on the left with the plate legend and bar weight. Compared with the 1600×900 screenshot of the 2025 production /display/current screen: same structure and colours; differences: no QR code on the stage, plate bar is smaller.
- `bun run gate:full` passes.
