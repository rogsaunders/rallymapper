# RouteMapper — User Guide

Welcome to RouteMapper. This guide covers everything you need to get up and running, from signing in to exporting your first roadbook.

If you're brand new, the fastest path to value is **Guest Mode** — no signup, no install, just open the app and start mapping.

---

## Getting Started

### Open the app

**[app.routemapper.net](https://app.routemapper.net)** — runs in any modern browser, no install required.

### Three ways to start

- **Guest Mode** — open the app and tap **Continue as Guest**. Full functionality, no signup, no email. Data stays on your device.
- **Free account** — sign up at the welcome screen for cloud sync across devices, 1 saved stage, and 20 waypoints per stage. Permanent free tier.
- **Paid plan** — Event Pass (one event, 60 days), or Solo / Pro for unlimited stages and the full export package. See [routemapper.net/#pricing](https://routemapper.net/#pricing).

You can start in Guest Mode and create an account later.

---

## Install as a Progressive Web App

For the best experience, install RouteMapper to your home screen. It runs full-screen, works offline, and behaves like a native app.

### iPhone / iPad (Safari)
1. Open [app.routemapper.net](https://app.routemapper.net) **in Safari** (not Chrome).
2. Tap the **Share** button (square with arrow).
3. Scroll and tap **Add to Home Screen** → **Add**.

### Android (Chrome)
1. Open [app.routemapper.net](https://app.routemapper.net) in Chrome.
2. Tap the **Install app** banner — or three-dot menu → **Install app**.

### Desktop (Chrome / Edge)
1. Look for the install icon at the right of the address bar.
2. Click **Install**.

> **Important:** Keep RouteMapper in the foreground while recording a route. On iOS, switching to another app may pause GPS tracking.

---

## Supported Browsers

| Browser | Status |
|---------|--------|
| Safari (iOS / iPad) | Recommended on Apple devices |
| Chrome (Android) | Recommended on Android |
| Chrome / Edge (desktop) | Fully supported |
| Firefox | Works, but PWA install not supported on mobile |

---

## Quick Start Walkthrough

Eight steps from cold start to your first exported roadbook. Allow about 15 minutes.

### 1. Sign in (or continue as guest)
Open the app. Sign in with your account, or tap **Continue as Guest**.
**Expected:** the main screen with a map on one side and control panels on the other.

### 2. Set up a stage
Enter **Trip name**, **Day**, **Route**, and **Stage name** at the top.

### 3. Start recording
Tap the green **Start Stage**. Allow location access when prompted.
**Expected:** your position appears on the map; the GPS panel shows live coordinates.

### 4. Record a short route
Walk or drive a short loop — five to ten minutes is plenty. Watch a breadcrumb track build behind you on the map.

### 5. Add waypoints

The snap-first flow: **tap first, refine second**. GPS locks the moment you tap; you then have a short window to choose icon and notes.

Try all four methods:

1. **Tap-then-refine** — Tap **Add Waypoint (Current GPS)**. A pending amber card appears with a countdown. Choose an icon (e.g. Hazard → Danger 2) and/or type a POI note. Tap **✓ Done** to commit early, **Discard** to cancel, or just let it auto-commit.
2. **Voice dictation** — Tap **Add Waypoint**, then tap **Dictate**. Speak your note while the pending card is active; the spoken text fills the POI field before auto-commit.
3. **Different icon types** — try Navigation, Hazard, Control, Terrain, and Note icons. Your last-used type persists, so for a stream of same-type waypoints you just tap → let it commit.
4. **Hands-Free voice** *(for solo drivers)* — see [Features in Depth → Hands-Free voice mapping](#hands-free-voice-mapping) below.

**Expected:** while pending, a dashed amber circle on the map at the captured GPS position. On commit, it switches to a solid icon marker and appears in the Waypoints panel with type, icon, time, and distance from the previous waypoint.

### 6. End the stage
Tap the red **End Stage**. The app generates a roadbook, saves your data, and offers an export ZIP.

### 7. Check the export
Open the ZIP and read the **`README.txt`** at the root — it tells you which file to use for which tool. The layout is:

- **`Universal/`** — `route.gpx` and `route.kml` for any mapping tool (Garmin, Hema, Guru, Gaia, Google Earth)
- **`RallyNavigator/`** — `route.gpx` bundled for Rally Navigator import
- **`Printable/`** — `roadbook.html`, `roadbook.docx`, `roadbook.csv`, plus `map.pdf` when generated
- **`Source/`** — `stage.json` to re-import back into RouteMapper
- **`Garmin/`, `Hema/`, `Gaia/`** — tool-specific bundles for users who prefer pre-organised file conventions

Open the HTML roadbook and the map PDF — both should render cleanly.

### 8. Review past stages
Tap the green **History** button in the stage control row. The panel lists your last 20 stages. Tap **Open** on a row to load it in review mode (read-only — your current session is unaffected). Tap **↓ Re-export ZIP** to regenerate the export, or **Close Review** to return to the live screen.

---

## Features in Depth

### Snap-first waypoint capture

GPS locks the moment you tap **Add Waypoint** — no position drift while you choose an icon. At 100 kph, the delay between tap and commit could otherwise mean 50–140 m of error; snap-first eliminates that.

**Flow:**
1. Tap **Add Waypoint (Current GPS)** — GPS captures instantly; a pending amber card appears with a countdown.
2. Within the edit window (default 5 s), refine icon and/or POI note.
3. Auto-commit when the countdown ends, **✓ Done** to commit early, **Discard** to cancel.

**Adjustable:** the **Snap window (edit after tap)** slider in the ⚙️ settings cog runs 2–10 seconds. A second tap while pending auto-commits the first and snaps a new one.

### Waypoint icons

RouteMapper organises 29 icons into 5 types. Your last-used type persists between waypoints, so a sequence of same-type captures takes one tap each.

| Type | Icons |
|------|-------|
| **Note** | Note (general purpose) |
| **Hazard** | Danger 1 · Danger 2 · Danger 3 |
| **Terrain** | Bump · Bumps · Dip · Twisty · Ruts · Washout · Up Hill · Down Hill |
| **Nav** | Left · Right · Keep Left · Keep Right · Straight · Gate · Cattle Gate · Railroad · Give Way · Caution |
| **Control** | Start · Finish · Stop · Checkpoint · Time Control · Fuel · Service |

All 29 icons follow OpenRally and Garmin symbol standards. They render identically across the in-app map, generated roadbook tulips, and KML/GPX exports.

### Hands-Free voice mapping

Hands-Free mode locks GPS the instant the wake word "Mapper" is recognised — **before you say anything else**. At speed, the recorded position is where you were when you called it, not where you ended up while speaking the command.

**Flow:**
1. Tap **Activate** in the Hands-Free panel — listening for the wake word.
2. Say **"Mapper"** — beep + the panel turns amber ("📍 GPS locked"). GPS is locked at this instant.
   > Speech recognition handles common variations — *"map"*, *"map a"*, and *"map her"* are all heard as *"Mapper"*.
3. Speak: *type + icon + dash + note*

   | You say | Result |
   |---------|--------|
   | *"Mapper… hazard danger two — rocks on track"* | Hazard waypoint, Danger 2 icon, *"rocks on track"* note |
   | *"Mapper… left — onto gravel road"* | Nav waypoint, Left icon, *"onto gravel road"* note |
   | *"Mapper… terrain washout"* | Terrain waypoint, Washout icon, no note |
   | *"Mapper… bump"* | Terrain waypoint, Bump icon (type inferred) |
   | *"Mapper… control fuel — stop for fuel"* | Control waypoint, Fuel icon, *"stop for fuel"* note |
   | *"Mapper… note — fuel stop ahead"* | Note waypoint, *"fuel stop ahead"* |
   | *"Mapper… caution"* | Nav waypoint, Caution icon (type inferred) |
   | *"Mapper… keep left"* | Nav waypoint, Keep Left icon |

   You can omit the type if the icon name is unambiguous — *"Mapper… left"* works as well as *"Mapper… nav left"*.
4. After a short silence, the waypoint commits to the locked GPS position.
5. Say nothing for the voice snap window and it auto-commits with the last-used icon — useful for repeated waypoints of the same type.
6. Say **"cancel"**, **"discard"**, or **"abort"** to drop the pending waypoint.

**Three sliders** in the ⚙️ panel, all in one place:
- **Silence timeout** — pause after speaking before the command fires (1.5–5 s)
- **Voice snap window** — how long after "Mapper" before auto-commit (3–10 s)
- **Snap window (edit after tap)** — for the manual tap flow, not Hands-Free (2–10 s)

A Bluetooth headset with mic significantly improves accuracy in noisy or windy conditions.

### Trip, Day, Route, Stage

Multi-day events are organised in a four-level hierarchy:

- **Trip Name** — the overall event (e.g. *Flinders Ranges 2026*)
- **Day** — increments the day number; resets route and stage to 1
- **Route** — increments the route within the day; resets stage to 1
- **Stage** — increments the stage within the route

Day, Route, and Stage controls are disabled while a stage is recording and unlock when you tap **End Stage**. The **Route name** field is editable for each route — give each one a descriptive label (e.g. *Wilpena Pound Loop*).

Every stage is saved independently, so a multi-day event becomes a clean tree in your export ZIP: *Day 1 / Route 1 / Stage 1.gpx*, *Day 1 / Route 1 / Stage 2.gpx*, and so on.

### Stage History

Every completed stage is saved automatically. The **History** button on the stage control row opens a panel listing your last 20 stages with date, name, distance, and waypoint count.

Tap **Open** to load any past stage in review mode:
- Map switches to the historical route and waypoints
- Amber banner shows stage name and date
- **↓ Re-export ZIP** regenerates the full export package
- **Close Review** returns to the live screen

History is read-only — opening a past stage doesn't affect your current session. The button is hidden while a stage is recording; it reappears when you end the stage.

### Map PDF export

Every completed stage's export ZIP includes a printable map PDF — A4 landscape, route line, waypoint markers, stage title, date, distance, and waypoint count.

You can also export the map at any time during a stage via **Export Map PDF** in the map controls. Useful for sharing a route overview before the roadbook is complete.

> **Note:** the PDF captures the map exactly as on screen. Make sure your route is visible in view before exporting; the app waits up to 2 s for tiles to settle before capturing.

### Roadbook with tulips

The HTML roadbook generates automatically when you end a stage. Each waypoint appears as a row with:
- Distance from the previous waypoint
- Total stage distance to that point
- Tulip diagram (auto-generated from the GPS track angles)
- CAP heading values
- Your icon and POI note
- Time of capture

Open the HTML roadbook in any browser. It's print-friendly and works on any device — no special software required.

### Export package

One ZIP per stage, organised by use case rather than by file type. A `README.txt` at the root tells you which file to pick:

- **`Universal/`** — `route.gpx` (waypoints + track combined) and `route.kml`. Works in Garmin BaseCamp, Hema Maps, Guru Maps, Gaia GPS, Google Earth, and any modern GPX/KML viewer.
- **`RallyNavigator/`** — `route.gpx` bundled for Rally Navigator. RN imports the polyline and waypoints cleanly.
- **`Printable/`** — `roadbook.html` (open in any browser and print), `roadbook.docx` (edit in Word or Pages first), `roadbook.csv` (tabular view for Excel / Numbers / Sheets), and `map.pdf` when generated.
- **`Source/`** — `stage.json` to re-import the full stage back into RouteMapper, plus `roadbook.json` and `manifest.json` for technical use.
- **`Garmin/`, `Hema/`, `Gaia/`** — tool-specific bundles in those products' preferred folder conventions.

`Universal/` also includes `track.gpx` and `waypoints.gpx` (separate variants of `route.gpx`) for any consumer that prefers them split rather than combined.

---

## Plans

You can use the full waypoint and roadbook workflow in Guest Mode and on the Free tier. Upgrade when you need:

- More than one saved stage (Free → any paid plan)
- More than 20 waypoints per stage (Free → any paid plan)
- Full export package (Free → Event Pass / Solo / Pro)
- Commercial use (Solo → Pro)

Current prices at [routemapper.net/#pricing](https://routemapper.net/#pricing). Manage your plan from the **Account** panel inside the app — upgrade, downgrade, or cancel any time. All billing handled securely through Stripe.

---

## Tips for the Field

- **Charge your device** before recording — GPS drains battery quickly.
- **Use a phone or tablet mount** if recording while driving — essential for Hands-Free mode.
- **Hands-Free pacing** — pause briefly after "Mapper" before your command. The dash separator (or a natural pause) splits the icon type from your note text.
- **Tune the snap windows** — the ⚙️ cog has three sliders. On open terrain, 3–4 s for voice snap is plenty; in tricky navigation, 7–8 s gives you room to think.
- **Bluetooth headset** — in a noisy vehicle or windy conditions, a headset mic dramatically improves voice accuracy.
- **Stage History is read-only** — review past stages freely between live sessions; nothing gets overwritten.
- **Pre-load tiles** — pan around your area on a connection before going off-grid; cached map tiles render even when you lose signal.

---

## Known Limitations

- **iOS background tracking** — switching away from RouteMapper while recording may pause GPS on iOS. Keep the app in the foreground.
- **Voice features** require a browser that supports the Web Speech API — best in Safari (iOS / iPad) and Chrome (Android / desktop).
- **Very large stages** — recordings with 1000+ track points may save slowly on older devices.
- **Offline cloud sync** — the app works fully offline; data syncs automatically when connectivity returns.
- **Android tablets** — supported in Chrome, but glove-friendly controls are tuned for iPad. Native Android tablet polish is on the roadmap.

---

## Your Data & Privacy

- GPS tracks and waypoints are stored in our cloud database (Supabase, US region) when you have an account. Guest Mode keeps everything on your device.
- We use this data only to provide the service. We don't sell it and we don't share it with third parties beyond the infrastructure providers needed to run the app.
- Crash reports are collected via Sentry — error details and device info only, no personal data.
- Full policy: [routemapper.net/privacy.html](https://routemapper.net/privacy.html).

You can export or delete your data at any time — contact us via the form below.

---

## Get Help

**Most questions answered in the FAQ:** [routemapper.net/#faq](https://routemapper.net/#faq).

**Bug reports and other contact:** [routemapper.net/contact.html](https://routemapper.net/contact.html). When reporting a bug, please include:
- What you were doing
- What happened
- What you expected
- Device and browser (e.g. *iPhone 14, Safari* — or visit [whatismybrowser.com](https://www.whatismybrowser.com) and share the result)
- A screenshot or screen recording if possible

---

Happy mapping.
