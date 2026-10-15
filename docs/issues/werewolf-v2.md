---
title: "Werewolf v2 — rewrite: rulebook as data, offline-first desk, live sync, client's team classifications"
status: ready-for-agent
story-prefix: ww
---

# Werewolf v2

## Problem Statement

Werewolf runs our client's strength meets (bench press and deadlift so far, ~190 entries, many divisions such as Open, MONSTER, Uniformed services, Miners) on one organizer's devices: a desk laptop entering declarations and verdicts, an announcer next to it, a TV showing the current attempt or the scoreboard, and a public results page. The current app works, but:

- It is ~35k lines of production code for a job that is mostly a few tables and rankings. Lifts, rankings and screens are hard-coded around squat/bench/deadlift, so every new rule means code in many places.
- Divisions are loose labels filtered inconsistently: a MONSTER-only lifter showed up in the announcer table, desk tables, public results, team points and exports, where it must not.
- It is slow: every screen reads D1 through layers of requests and ad-hoc caches; screens poll.
- The hall has weak 5G that drops for about a minute at a time. Screens and even the announcer sitting next to the desk fell out of sync; the desk cannot work without the internet.
- The client asked for four team classifications for November 2026 (men top 5 Reshel; women top 5 Reshel; bench 4 men + 1 woman; deadlift 4 men + 1 woman), a biceps curl event that lifters may enter alone, and a kids division whose rules are not yet known.

## Solution

Rewrite the app from scratch in a new worktree, keeping only the concepts that proved useful, and run it beside the old app until a rehearsal passes, before the mid-November 2026 meet.

- **Rulebook as data.** A contest is defined by a JSON rulebook: lifts (any name, all behaving the same), attempts per lift, divisions as tags (Open is everybody) with optional conditions, age/weight class templates, and individual and team classifications (division, lifts, formula, split, quota). The client's four team rankings, biceps curl and kids are configuration.
- **One pure contest core.** All rules live in one deterministic module: rulebook + ordered commands → state, lifting order and every classification.
- **One Durable Object per contest** is the single source of truth, storing its commands in its own SQLite and pushing changes to every connected device over WebSocket.
- **Offline-first devices.** Every device keeps a local replica; the desk keeps working with no internet and syncs when it returns. Devices that met while online keep syncing peer-to-peer over the shared Wi-Fi (WebRTC) when the internet drops.
- **Screens kept:** stage screen with barbell, announcer view, scoreboard with remote filter/QR, public results, exports, backups, wizard, CSV/Excel entry import, Polish and English.
- **Stack** like our other projects: Bun, Effect on the server, React with Effect Atom on the client, one Cloudflare Worker serving API and static app, deployed by Alchemy with Cloudflare OAuth. Open source; each organizer deploys their own copy.

## User Stories

### Rulebook and contest setup

1. As an organizer, I want to create a contest from a preset rulebook (bench + deadlift, powerlifting, single lift), so that a typical meet is ready in minutes ^ww-s8ny
2. As an organizer, I want to define the contest's lifts freely (bench press, deadlift, squat, biceps curl or any named lift), so that a new lift never needs new code ^ww-dwfd
3. As an organizer, I want to set the number of attempts per lift (default 3), so that the rulebook matches the federation ^ww-8fz8
4. As an organizer, I want to define divisions (Uniformed services, Miners…) as tags for the contest, so that every group gets its own ranking; Open is everybody and MONSTER is a lift ^ww-ot23
5. As an organizer, I want a division to carry optional conditions (sex, age range at contest date, bodyweight range, allowed lifts), so that the app refuses entries that do not belong there ^ww-lxn4
6. As an organizer, I want age classes and weight classes from templates that I can edit per contest, so that rankings can be split the way the federation requires ^ww-ym25
7. As an organizer, I want to define individual classifications (which division, which lifts, formula, split by age/weight class or not), so that every results table is a rule, not code ^ww-m7xy
8. As an organizer, I want to define team classifications (which division or everybody, which lifts, formula, quota: any N or N men + M women), so that the four team rankings the client asked for are configuration ^ww-4yp8
9. As an organizer, I want the men's team classification: top 5 men of a team by Reshel points in bench or deadlift, each man counted once with his best result, so that the client's rule 1 holds ^ww-fwnw
10. As an organizer, I want the women's team classification: top 5 women of a team by Reshel points in bench or deadlift, each woman counted once with her best result, so that the client's rule 2 holds ^ww-gybz
11. As an organizer, I want the bench team classification: 4 best men + 1 best woman of a team in bench by points, so that the client's rule 3 holds ^ww-ub7m
12. As an organizer, I want the deadlift team classification: 4 best men + 1 best woman of a team in deadlift by points, so that the client's rule 4 holds ^ww-dtzk
13. As an organizer, I want incomplete teams classified with the points they have, below complete teams only by their lower sum, so that small clubs still appear ^ww-eje4
14. As an organizer, I want to choose the formula per classification: kilograms, Reshel, or Reshel × McCullough, so that kids or curl can be ranked by kilograms while adults use Reshel ^ww-90sr
15. As an organizer, I want to manage the contest's team list (add, rename, merge), so that "Górnik" and "GÓRNIK" are one team ^ww-tzv6
16. As an organizer, I want to set bar weights per sex, clamp weight and the plate inventory, so that declared weights are loadable ^ww-sy28
17. As an organizer, I want to export and import a contest's rulebook as JSON, so that next year's meet starts from this year's rules ^ww-7s20
18. As an organizer, I want a step-by-step contest wizard (basics, rulebook, divisions and classifications, teams, entries, review), so that setup is guided ^ww-r2tx

### Entries

19. As an organizer, I want to add a lifter with name, sex, birth date and team, so that they can enter contests ^ww-2jxr
20. As an organizer, I want an entry to pick any subset of the contest's lifts, including only one (e.g. only biceps curl), so that single-lift lifters are first-class ^ww-3vpp
21. As an organizer, I want one entry per lifter with all their lifts (bench, MONSTER, deadlift, strict curl) and zero or more division tags, so that a MONSTER-only lifter appears only in MONSTER rankings and nobody is entered twice ^ww-ss5k
22. As an organizer, I want the app to warn when an entry does not meet a division's conditions, so that mistakes are caught at the desk ^ww-s8zx
23. As an organizer, I want to import entries from CSV/Excel (name, surname, sex, birth date, team, lifts, divisions, opening weights), so that the client's list does not have to be retyped ^ww-8pme
24. As an organizer, I want to enter bodyweight at weigh-in and see age class, weight class and coefficients update immediately, so that weigh-in is one screen ^ww-1mwv
25. As an organizer, I want rack heights per entry per lift that needs them, so that the loaders see them ^ww-ewrn
26. As an organizer, I want lot numbers drawn automatically and editable, so that ties in the lifting order are fair ^ww-nmgu
27. As an organizer, I want to declare opening weights for each lift at entry time, so that the lifting order exists before the meet starts ^ww-y3gt

### Meet day at the desk

28. As the desk, I want the lifting order computed automatically: lift by lift, round by round, lightest declared weight first, then lot number, so that I always know who is next ^ww-cdxd
29. As the desk, I want to move a lifter manually in the order, so that real-life exceptions are handled ^ww-tds3
30. As the desk, I want to set the current attempt with one click from the order, so that every screen shows it ^ww-u0ni
31. As the desk, I want to record a verdict (good / no lift) in one click while the screens keep showing that attempt with its result until I set the next lifter live by hand, so that the hall sees each result (changed by the owner on 2026-10-15; before, the next attempt became current automatically) ^ww-adgy
32. As the desk, I want to declare or change the next attempt's weight right after a verdict, so that declarations keep pace with the platform ^ww-z7vp
33. As the desk, I want declared weights checked against the plate inventory and the bar + clamps minimum, with the nearest loadable weight suggested, so that impossible weights are not called ^ww-mq50
34. As the desk, I want to correct any past attempt (weight or verdict), so that mistakes are fixable and rankings follow ^ww-lcu1
35. As the desk, I want to keep working with no internet at all, with every change saved on my device, so that a dropped 5G link never stops the meet ^ww-mned
36. As the desk, I want a clear indicator of connection state and of changes not yet sent, so that I know what the other screens have seen ^ww-yo7x
37. As the desk, I want my offline changes sent automatically when the connection returns, in the order I made them, so that nothing is lost or reordered ^ww-gouf
38. As a second editing device, I want my changes merged with the desk's: different fields both apply, the same field takes the later change, so that two editors never corrupt the contest ^ww-9hlk
39. As the desk, I want undo of my last change, so that a misclick costs one click ^ww-8ta6
65. As the desk, I want to mark an entry as did not start (DNS) in a lift with one click, so that it leaves the lifting order, gets no place in that lift, shows DNS in tables and exports, and the mark can be undone ^ww-9jq6

### Live screens

40. As the stage screen, I want the current lifter, their team, divisions, bodyweight, the attempt number, declared weight, previous attempts and the barbell with plates per side, so that the audience and loaders see what matters ^ww-widg
41. As the stage screen, I want verdicts shown the moment the desk records them, so that the hall reacts in sync ^ww-ufi7
42. As the announcer, I want a view with the current lifter, the next 3–5 lifters with declared weights, and live places in each of the current lifter's divisions, so that I can talk about who is next ^ww-6pk1
43. As the scoreboard, I want a table of all entries filtered by division, lift, sex, age class or weight class, with auto-scroll, so that the TV shows something useful all day ^ww-8tai
44. As the desk, I want to push a filter and the QR code to the scoreboard remotely, so that I do not walk to the TV ^ww-l06a
45. As a viewer, I want each screen to open from a read-only link or QR code without a password, so that setup takes seconds ^ww-uewf
46. As the announcer next to the desk, I want my view updated within a second even when the internet drops, as long as we share the Wi-Fi, so that I never announce stale information ^ww-bjq1
47. As any screen, I want to show the last known state with a "no connection" mark and catch up automatically, so that a screen never goes blank ^ww-6oq1
48. As any screen, I want updates to arrive within ~200 ms of the desk's change when online, so that the app feels instant ^ww-bdzb

### Results

49. As anyone, I want individual rankings per classification, split by age/weight class when the classification says so, so that every medal is computed ^ww-sbfk
50. As anyone, I want rankings to contain only the classification's lifts and division(s), so that MONSTER (a lift) never leaks into the bench rankings ^ww-zpeu
51. As anyone, I want ties broken by: more points, then lighter bodyweight, then who reached the result first, so that rankings are deterministic and fair ^ww-1pjp
52. As anyone, I want each team classification shown with each team's counted lifters and their points, so that the score is explainable ^ww-6hvn
53. As anyone, I want a public results page per contest (link and QR), updated live, so that lifters check results on their phones ^ww-gr75
54. As an organizer, I want to export any ranking as CSV (federation format), PDF and JPG, so that results can be published and sent to the federation ^ww-254l
55. As an organizer, I want the CSV export compatible with the format we sent last year (per lift: place, name, age class, weight class, attempts with failed ones negative, best, Reshel, McCullough points), so that the federation's process does not change ^ww-52g7

### Data safety and operations

56. As an organizer, I want to download a full backup of a contest as one file and restore it, so that a contest can be moved or recovered ^ww-6ft3
57. As an organizer, I want automatic backups of every contest during the meet, so that a disaster costs minutes, not the meet ^ww-edqp
58. As an organizer, I want the two contests from 2025 migrated into the new app with identical results, so that history is kept ^ww-zchn
59. As an organizer, I want to log in with one organizer password, so that only we can edit ^ww-n7wy
60. As an organizer, I want the whole interface in Polish and English, so that the app can be shared ^ww-dh53
61. As another organizer, I want to deploy my own copy with one command and a Cloudflare login, so that the project is usable as open source ^ww-029g
62. As an organizer, I want the new app to run beside the old one until the rehearsal passes, so that switching carries no risk ^ww-4g2a

### Kids and the unknown

63. As an organizer, I want kids age classes (2–8, 9–12; ages 13–16 are T16, changed by the owner on 2026-10-15) and check boxes for the age classes that count in team classifications, so that kids can be kept out of team points without code changes ^ww-e1fo
64. As an organizer, I want a contest whose only lift is biceps curl, or where some lifters do only curl, so that curl needs no special handling ^ww-03e1

## Implementation Decisions

- **Contest core (pure module, the main seam).** Input: a rulebook and an ordered list of commands. Output: contest state plus derived views: lifting order, current attempt, per-entry results, every classification. No I/O, no clock (commands carry timestamps), deterministic. All rules (lifting order, loadability, coefficients, formulas, tie-breaks, team quotas, division membership and conditions) live here and nowhere else. Clients and the Durable Object run the same module.
- **Commands, not CRUD.** Every change is a command (e.g. contest configured, team added/renamed/merged, lifter added, entry created/edited, bodyweight recorded, weight declared, current attempt set, verdict recorded, order overridden, undo). Commands are validated by the core; invalid commands are rejected with a reason the UI shows.
- **Rulebook schema (JSON, versioned).** Lifts: id, name per language, attempts. Divisions: id, name, conditions (sex, age range at contest date, bodyweight range, allowed lifts). Age/weight class tables per sex. Classifications: id, name, kind individual|team, divisions (or all), lifts counted, formula kg|reshel|reshel×mccullough, aggregation (best single lift | sum of lifts), split by age class/weight class/none, team quota (any N | N men + M women), each lifter counted once with their best eligible result. Equipment: bar weights per sex, clamp weight, plate inventory. Presets ship as rulebooks; the client's 2026 rulebook ships as a preset.
- **Results.** Best good attempt per lift; points by formula with coefficients from the bundled Reshel and McCullough tables (age at contest date, timezone-free). Tie-break: points desc, bodyweight asc, earlier time of reaching the result. Team: per team pick each lifter's best eligible points, fill the quota, sum; incomplete teams ranked by their sum; tie-break by the best counted lifter, then next.
- **Lifting order.** Lift by lift in rulebook order, round by round, declared weight asc, lot number asc; manual overrides are commands. No flights.
- **Durable Object per contest.** Holds the rulebook and the command log in its SQLite, assigns each accepted command a sequence number, rebroadcasts it to connected devices, serves snapshots (state at sequence N) and command ranges for catch-up. A small index (D1 or the Worker's own storage) lists contests. Automatic periodic snapshots/backups go to R2.
- **Sync protocol.** Devices keep a local replica (IndexedDB) of the log and pending local commands. On reconnect they send pending commands in order and fetch what they missed; the server order is authoritative and clients rebase pending commands on it. Field-level last-writer-wins for conflicting edits by different devices. Transport is pluggable: WebSocket to the Durable Object, and WebRTC data channels between devices of the same contest (signalled through the Durable Object while online, kept alive over the LAN when the internet drops); a device relays commands it receives from peers to the Durable Object when it can.
- **Auth.** One organizer password per deployment gives edit rights (session cookie). Every screen and the public results open through a read-only link per contest (unguessable token, shown as QR).
- **Web app.** React SPA with Effect Atom state over the local replica; routes: contests, wizard, desk, entries/weigh-in, results, settings, and read-only stage/announcer/scoreboard/public results. Polish default, English complete.
- **Exports.** CSV in last year's federation format (semicolon, BOM, failed attempts negative), PDF and JPG of any ranking.
- **Migration.** A one-off script converts the 2025 production data (D1 export) into rulebooks + command logs; results must match the old rankings except where the old app was wrong (MONSTER leak), and those differences are listed.
- **UI continuity.** The interface uses Tailwind CSS and copies the markup, classes and texts of the 2025 app (its Polish and English texts are bundled unchanged): desk tabs (Stanowisko, Rejestracja, Wyniki drużynowe, Obciążenia, one table per lift), the attempt table with live and status buttons, the stage screen, the announcer table with auto-sync and auto-scroll, the public table and the public results. The 2025 "Wyniki indywidualne" tab is removed: the lift tables show points and sort by them. Team results have one tab per team classification. The operator does not relearn the screens. Fonts ship with the app so that screens work offline.
- **Client meeting 2026-10-12.** MONSTER is a lift (bench in a shirt), strict curl is a lift, SAMORZĄDOWIEC is dropped, kids are age classes, the desk starts a 60 s attempt clock by hand (the length is a contest setting) and the stage screen shows it, the stage screen plays a video after each verdict, lift and team tables print and export to Excel as filtered, plates in the picture keep their colour visible, and the screens show the WUAP logo.
- **Deployment.** Alchemy stack: one Worker (API + static assets), the contest Durable Object class, R2 for backups, optional D1 index; Cloudflare OAuth profile; new URL beside the old app until cut-over.

## Testing Decisions

- Test external behaviour only: commands in, views out; protocol messages in and out; what a user sees on screen. No tests of internal helpers.
- **Seam 1 — contest core (pure, fast, most tests).** Scenario tests built from a rulebook + commands asserting lifting order, results and classifications. Covers ww-s8ny, ww-dwfd, ww-8fz8, ww-ot23, ww-lxn4, ww-ym25, ww-m7xy, ww-4yp8, ww-fwnw, ww-gybz, ww-ub7m, ww-dtzk, ww-eje4, ww-90sr, ww-tzv6, ww-sy28, ww-7s20, ww-3vpp, ww-ss5k, ww-s8zx, ww-1mwv, ww-nmgu, ww-y3gt, ww-cdxd, ww-tds3, ww-u0ni, ww-adgy, ww-z7vp, ww-mq50, ww-lcu1, ww-9hlk, ww-8ta6, ww-9jq6, ww-sbfk, ww-zpeu, ww-1pjp, ww-6hvn, ww-e1fo, ww-03e1. Prior art: the old domain team-results and coefficient tests, the old results snapshot (fixture for ww-zchn).
- **Seam 2 — sync (Durable Object + client replica in the Workers runtime).** Two simulated devices, dropped connections, reordered delivery, peer relay. Covers ww-mned, ww-yo7x, ww-gouf, ww-9hlk, ww-bjq1, ww-6oq1, ww-bdzb, ww-6ft3, ww-edqp, ww-n7wy, ww-uewf. Prior art: mr.robot's workerd Durable Object tests.
- **Seam 3 — screens (a few React component tests) + one manual rehearsal** with real devices on one Wi-Fi and the internet cut. Covers ww-r2tx, ww-2jxr, ww-8pme, ww-ewrn, ww-widg, ww-ufi7, ww-6pk1, ww-8tai, ww-l06a, ww-gr75, ww-254l, ww-52g7, ww-dh53, ww-029g, ww-4g2a. Prior art: wiser's React tests.
- Migration (ww-zchn) is verified by comparing the migrated rankings with the old app's results snapshot.

## Out of Scope

- Flights, timers, judge lights, records, fourth attempts, disqualification management, photos. (Did not start is in scope; disqualification is not.)
- Multi-organizer hosting, accounts and roles beyond the organizer password.
- A local server or LAN-only operation without any prior internet contact.
- Keeping the old API or database shape; the old app is retired after cut-over.

## Further Notes

- Kids rules arrive after the client meeting (2026-10-10); the rulebook must absorb them without code.
- Old app inventories (desk, displays, scoring/exports) were taken on 2026-10-08 and informed what is kept; the old repository stays in git history.