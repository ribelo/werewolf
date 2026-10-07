# Werewolf Cloud — User Guide

For meet directors and volunteers running a competition on the Cloudflare-hosted Werewolf Cloud app.
Polish is the default UI language; every screen exists in Polish and English (switch it in **Ustawienia**).
Architecture and API details for developers live in `werewolf-cloud/docs/`.

## 1. Before the meet

### 1.1 What you need
- A browser on the desk machine (Chrome/Chromium, Firefox or Safari) and the URL of your deployment.
- **The organizer password.** This is the only credential operators need; it is the app's own login.
  Cloudflare account credentials (API tokens, dashboard access) are for whoever deploys the app and must not
  be shared with desk operators — the app never asks for them.
- A second screen or tablet for the announcer table and the big screen.

### 1.2 Prepare the data
1. Sign in and create the contest (§2).
2. Add competitors and registrations (§3).
3. Check the plate inventory, rack-height defaults, categories and tags (§2.4, §3.3, §6).
4. Do one dry run: open `/display/current` and `/display/table` on the second screen and walk through a few
   attempts.

## 2. Signing in and creating a contest

### 2.1 Sign in
Open the app root. If a session is active you land on the command centre; otherwise you are sent to
`/login` and asked for the organizer password. The session lasts 14 days of use; `Wyloguj` (logout) is
available from the app shell. Public display pages never ask for a password.

### 2.2 Create a contest
Use **Stwórz Zawody** → the wizard. Enter name, date, location and discipline (Powerlifting, Squat, Bench or
Deadlift), plus optional federation rules, competition type, organizer and notes. Creating a contest seeds
the default plate set, the URP age/weight categories and the mandatory **Open** tag.

### 2.3 Contest details
The contest page has tabs: **Stanowisko** (desk), **Rejestracja** (main table), **Przysiad**,
**Wyciskanie**, **Martwy ciąg**, **Wyniki indywidualne**, **Wyniki drużynowe**, **Obciążenia**,
**Kopie zapasowe**.

### 2.4 Categories, tags and plate sets
- **Categories** (age and weight classes) are per contest. Open the category manager to rename, reorder or
  replace them; a category that is already referenced by a registration cannot be deleted. "Restore defaults"
  is only allowed while the contest has no registrations.
- **Tags** group results (for example an Open/uniformed board). The **Open** tag is mandatory and cannot be
  deleted.
- **Obciążenia** holds the plate inventory (weight, quantity, colour) and the men's/women's bar weights. The
  plate plan used by the desk and displays honours these settings plus the contest clamp weight.

## 3. Competitors, registrations and flights

### 3.1 Competitors
**Zawodnicy** manages the people: name, birth date, gender, club, city and notes. Competitors are reusable
across contests.

### 3.2 Register a lifter
Inside a contest, use **Rejestracja** → add registration. Choose the competitor, bodyweight, rack heights and
optionally the lifts the lifter entered; age category, weight class and the Reshel/McCullough coefficients are
derived automatically and can be overridden.

### 3.3 The main table
The **Rejestracja** tab shows one sortable table with place, name, city (club on the second line), sex,
flight, age and age category, bodyweight, weight class, Reshel/McCullough coefficients, rack heights, the
declared attempts for all three lifts, points, max lift and labels. Click a header to sort. Edit the bodyweight inline — the PATCH
recomputes categories and coefficients and updates the row without a reload. Labels are rendered as chips and
can be added or removed directly.

### 3.4 Flights and running order
If a contest is large, group lifters into flights (A, B, …) and give each one an order inside the flight. Use
the bulk flight assignment dialog to fill several registrations at once, then mark one flight as **active** —
the queue only serves lifters from the active flight.

## 4. Running the attempts

1. Open the contest and switch to the procedure screen you are running (**Przysiad**, **Wyciskanie** or
   **Martwy ciąg**) or the general **Stanowisko**.
2. Edit declared attempts with the attempt grid: three attempts per lift (the API also accepts a fourth).
   Weights must be loadable with the contest plate set, otherwise the save is rejected.
3. Record the result inline: **Pending → Udana / Nieudana**, with optional judge decisions. A skipped lift is
   recorded as **Nieudana**.
4. Press **Ustaw jako aktualną** to publish the attempt to the announcer table and the big screen, and
   **Wyczyść aktualną** when the lifter leaves the platform.
5. The queue card shows the rising-bar order for the current lift and round (lightest first, flight gating
   applied) and refreshes live.

All writes are optimistic: the UI updates immediately and the server confirms in the background. If the
connection drops, changes are queued and replayed — see §7.

## 5. Displays, results and sharing

### 5.1 Announcer table — `/display/table`
Read-only, large rows: current attempt, plate plan, queue and contest summary, with auto-scroll and auto-sync
options and a QR/share button.

### 5.2 Big screen — `/display/current`
Full-screen board for a projector or TV: current lifter, attempt number, weight, plate plan, rack heights and
recent history. It refreshes automatically and keeps the last payload if the network blips.

### 5.3 Sharing — `/display/share`
Public page with the QR code that opens the read-only public results for the contest.

### 5.4 Results
**Wyniki indywidualne** switches between open, age, weight and tag boards with best lifts, totals and points.
**Wyniki drużynowe** shows team/club standings. The public page at `/results/<contestId>` shows the same
data without a login. Export the meet from the results view: `POST /contests/<id>/results/export` returns CSV
or JSON.

## 6. Settings and system health

**Ustawienia** covers:
- **Język interfejsu** — Polish or English; the choice is stored in the app and on the server.
- Interface options (for example showing weights) and default bar weights.
- Plate set management, backup and restore, and system cards for the API, D1 database and KV.

## 7. Offline and queue behaviour

- The desk keeps accepting changes while the connection is down; they are stored in the browser and replayed
  when it returns. The header shows how many changes are queued and links to a drawer where you can retry or
  discard failed entries.
- Displays fall back to polling every 2 seconds and resume the WebSocket when it is available.
- On reconnect the app fetches the latest state; there is no replay of older events.

## 8. Troubleshooting

| Issue | What to do |
|-------|------------|
| Asked for a password you do not have | The organizer password belongs to the deployment; ask whoever deployed it. It is not your Cloudflare account password. |
| "Connection lost" toasts locally | Expected when running the dev server; the UI falls back to polling and recovers. |
| API badge stuck on "Sprawdzanie…" | Confirm the Worker is running and `PUBLIC_API_BASE` points at it, then reload. |
| Attempt weight rejected | The weight is not loadable with the current plate set/clamp or the lift is not registered for that lifter. |
| Displays show stale data | Check the connection badge; the display keeps the last payload while offline. |
| Language change does not stick | Save it in **Ustawienia**; the app writes it server-side and to `localStorage`. |

## 9. Support

Report problems through GitHub Issues with the contest name, the screen and what you expected. For a problem
during a meet, first use **Wyczyść aktualną** and reload the display pages — both are safe to repeat.
