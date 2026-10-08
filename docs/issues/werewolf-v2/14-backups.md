# 14: Backups: download, restore, automatic to R2

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-6ft3, ww-edqp

**What to build:** Download a contest (rulebook + command log) as one file and restore it into a new or the same contest; the Durable Object writes periodic snapshots to R2 during the meet.

**Blocked by:** 05

**Status:** done

- [x] Restore reproduces identical rankings
- [x] Automatic snapshot at least every 5 minutes while commands arrive
- [x] Restore cannot happen offline or without the organizer password

## Verified

- Worker/Durable Object: `GET /api/contests/:id/backup` downloads the contest as one file (the snapshot format: rulebook, details and the ordered log). `POST /api/contests/:id/restore` replaces that contest (links stay valid, connected screens get the new snapshot); `POST /api/restore` creates a new contest with a new identifier from a file. A file whose log does not replay is refused and the contest stays unchanged. All three need the organizer cookie (401 otherwise).
- Automatic backups: the contest actor sets an alarm at most 5 minutes after the first unsaved command and writes the snapshot to the R2 bucket `BACKUPS` (`contests/<id>/<sequence>-<time>.json`); with no new commands the next alarm writes nothing. The bucket is declared in the Alchemy stack (`infra/stack.ts`) and in both wrangler files. I did not run `alchemy plan` or deploy (that needs the Cloudflare login and is for ticket 16/17).
- Workerd tests (`backup.test.ts`): a downloaded backup restores into a new contest with identical log and identical individual and team rankings (ww-6ft3); restoring into the same contest replaces the log and keeps the links (ww-6ft3); restore without the cookie is 401, a broken backup is refused and changes nothing (ww-6ft3, ww-n7wy); the alarm is due within 5 minutes, writes the object, a second alarm writes nothing, a new command writes a second object (ww-edqp). R2 is the local test bucket of workerd, not Cloudflare.
- Desk tab "Kopia": download button and two file pickers (replace this contest, create a new one). Real Chrome with a local Worker (throwaway script): downloaded the file, restored it as a new contest and the desk of the new contest showed the same current attempt; with the Worker stopped, the restore pickers were disabled with a notice (offline restore is not possible).
- Not done: retention (old automatic backups are never deleted) and a screen to list or fetch automatic backups; they are in the R2 bucket and can be restored by downloading the object and using the file picker.
- `bun run gate:full` passes.
