# Werewolf — domain vocabulary

Werewolf runs strength competitions on meet day: entries, lifting order, judging, live screens and results. One installation serves one organizer.

## Competition

**Contest**:
One competition on one date at one venue, with its own rules, entries and results.
_Avoid_: meet (in code), event, competition (as an identifier)

**Rulebook**:
The data that defines a contest: its lifts, divisions, classifications and scoring. Presets (e.g. powerlifting, bench + deadlift) are rulebooks.
_Avoid_: discipline, competition type, config

**Lift**:
One kind of exercise contested in a contest, e.g. bench press, deadlift, squat, biceps curl. All lifts behave the same; only their names differ.
_Avoid_: discipline, event, exercise

**Division**:
A group a lifter is explicitly entered into for ranking purposes, e.g. Open, MONSTER, Uniformed services, Kids. Membership is explicit; no lifter belongs to a division implicitly.
_Avoid_: tag, label, category

**Age class / Weight class**:
A band of age (at contest date) or bodyweight used to split a division's ranking.
_Avoid_: age category, weight category

**Team**:
A named group of lifters (usually a club) chosen from the contest's team list.
_Avoid_: club (as free text)

## Entries

**Lifter**:
A person who competes. A lifter can enter many contests.
_Avoid_: competitor, athlete, zawodnik in code

**Entry**:
A lifter's participation in one contest: chosen lifts, divisions, team, bodyweight and rack heights.
_Avoid_: registration

**Lot number**:
A number drawn per entry that breaks ties in the lifting order.
_Avoid_: start number, competition order

## Meet day

**Attempt**:
One try at one lift by one entry, numbered 1..N, with a declared weight and a verdict.

**Verdict**:
The outcome of an attempt: pending, good or no lift.
_Avoid_: status, result

**Lifting order**:
The sequence in which attempts are called: lift by lift, round by round, lightest declared weight first, then lot number.
_Avoid_: queue, rising bar

**Current attempt**:
The attempt being lifted right now, shown on every screen.

**Desk**:
The device and role that enters declarations and verdicts.
_Avoid_: organizer view, manager

**Announcer view / Stage screen / Scoreboard**:
Read-only views: the speaker's view of the current and upcoming lifters; the big screen with the current attempt and the barbell; the table of all entries and attempts.

## Scoring

**Classification**:
A ranking defined by the rulebook: which division(s), which lifts count, the formula, optional split by age/weight class; individual or team.
_Avoid_: ranking type, results view

**Points**:
The score of a result under a classification's formula: kilograms, Reshel, or Reshel × McCullough.

**Reshel coefficient / McCullough coefficient**:
The bodyweight-and-sex factor and the age factor applied to lifted kilograms.

**Team classification**:
A classification that sums the best points of a team's lifters, with a quota per sex (e.g. any 5, or 4 men + 1 woman). Each lifter counts at most once, with their best eligible result.
