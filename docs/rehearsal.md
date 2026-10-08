# Rehearsal on real devices

Goal: run a mock meet with the desk, an announcer screen, a TV and a phone on one Wi-Fi, cut the internet several times, and check that no result is lost or reordered. The owner signs off at the end. The old app stays in use until then.

## Before

1. Open https://werewolf-v2.r-krzywaznia-2c4.workers.dev and log in on the desk laptop.
2. Open the migrated contest "MISTRZOSTWA POLSKI NIEPODLEGŁEJ WUAP". Open the **Kopia** tab and create a new contest from a backup of it. Use the copy for the rehearsal.
3. Reset the copy so that attempts can be judged again, or create a new contest with the wizard and import the 2025 entry list (CSV or Excel).
4. Open each screen once while the internet works: stage screen and announcer view on the second laptop, scoreboard on the TV, public results on a phone. Use the links at the top of the desk.
5. Check that the Wi-Fi allows device-to-device traffic (no client isolation). On the desk, the top bar must show "Local network devices: 3" after a minute.

## Run

1. Judge 20 attempts with the keyboard (G and N). Watch the stage screen and the announcer view: each verdict must appear at once.
2. Cut the internet (unplug the uplink or turn off mobile data on the router) for about one minute. Keep judging. Write down: does the announcer view still update? how long does it take? what does the desk show for "changes waiting"?
3. Restore the internet. Check that the waiting changes go to zero and the TV and phone catch up.
4. Repeat the cut three times. Once, reload the desk page while the internet is cut. Once, cut the internet while the desk and the announcer both show the same attempt.
5. Change the scoreboard filter from the desk. Show the QR code. Scan it with the phone.
6. Export the results: CSV, PDF, JPG. Send the CSV to the person who sends it to the federation and ask whether the file is what they need (see "Questions").

## Check at the end

- The log has the same attempts on every device. Compare the results page on the desk and on the phone.
- No attempt is judged twice and no verdict is missing.
- Download a backup and restore it into a new contest. The rankings must be identical.

## Questions for the owner

1. Does the federation need the old order of rows in the lift files? The new files list rows by the points of that lift. The old files used the combined place of both lifts. See `docs/migration/2025-report.md`.
2. Which license should the project have?
3. Is the Kids division still empty after the meeting on 2026-10-10? Add its rules to the rulebook in the wizard.

## Cut-over (only after sign-off)

1. Tell the organizers the new address. Keep the old address as it is.
2. Run the 2026 contest only in the new app.
3. Retire the old app after the November meet: stop using it. Deleting the old Worker, database and Pages project is a separate decision of the owner.
