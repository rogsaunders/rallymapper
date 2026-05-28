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
Tap the green **Start Stage**. Allow location access when prompted. This both starts recording and captures the current GPS position as the stage's start point.
**Expected:** your position appears on the map; the **🟢 GPS** indicator turns green in the map controls row. If you tap Start Stage before GPS is ready, the start point is captured automatically the moment a valid fix arrives.

If you realise the actual stage start was a little further on, tap **🚩 Update Start** (appears next to End Stage during an active stage) to reset the start position to your current location.

### 4. Record a short route
Walk or drive a short loop — five to ten minutes is plenty. Watch a breadcrumb track build behind you on the map.

### 5. Add waypoints

The snap-first flow: **tap first, refine second**. GPS locks the moment you tap; you then have a short window to choose icon and notes.

Try the three methods:

1. **Tap-then-refine** — Tap **Add Waypoint (Current GPS)**. A pending amber card appears with a countdown. Choose an icon (e.g. Hazard → Danger 2) and/or type a POI note. Tap **✓ Done** to commit early, **Discard** to cancel, or just let it auto-commit.
2. **Voice push-to-talk** — Tap **🎙 Record** in the Voice panel and speak your command, e.g. *"left onto Forbes Road"*. See [Features in Depth → Voice waypoints](#voice-waypoints-push-to-talk) below.
3. **Different icon types** — try Navigation, Hazard, Control, Terrain, and Note icons. Your last-used type persists, so for a stream of same-type waypoints you just tap → let it commit.

**Expected:** while pending, a dashed amber circle on the map at the captured GPS position. On commit, it switches to a solid icon marker and appears in the Waypoints panel with type, icon, time, and distance from the previous waypoint.

**Multiple waypoints at one spot:** rally control points often need several icons at the same GPS position (control + fuel + service). Just tap Add Waypoint as many times as you need — each tap creates a separate waypoint at your current position. Same applies to stationary captures at lights, gates, or while testing at the desk.

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

RouteMapper organises icons into six types. Your last-used type persists between waypoints, so a sequence of same-type captures takes one tap each.

| Type | Icons |
|------|-------|
| **Note** | Note (general purpose) |
| **Hazard** | Danger 1 · Danger 2 · Danger 3 |
| **Terrain** | Bump · Bumps · Dip · Twisty · Ruts · Washout · Up Hill · Down Hill |
| **Nav** | Left · Right · Keep Left · Keep Right · Straight · On Left · On Right · Gate · Cattle Gate · Railroad · Give Way · Caution |
| **Control** | Start · Finish · Stop / Restart · Checkpoint · Time Control · Fuel · Service |
| **Speed** | 25 · 40 · 50 · 60 · 80 · 100 · 110 km/h |

Icons follow OpenRally and Garmin symbol standards. They render identically across the in-app map, generated roadbook tulips, and KML/GPX exports. Adding new icons is a single edit to `src/icons/iconManifest.json` plus a matching SVG file — the registry, type picker, and exports pick them up automatically.

### Editing and deleting waypoints

Every non-START row in the Waypoints panel has two small buttons on the right:

- **✏️ Edit** — opens a modal with the waypoint's current type, icon, and POI text. Adjust any of them and tap **Save**. The change applies immediately; the waypoint's GPS position and timestamp are preserved.
- **🗑 Delete** — opens a confirm dialog showing the waypoint's label. Tap **Delete** to remove it. The recorded GPS track is **not** affected — only the roadbook row vanishes.

Both work during an active stage and during Stage History review. The START waypoint has no edit/delete buttons — it's controlled by the **🚩 Update Start** auxiliary button instead (which lets you reset the start position to your current GPS).

**Wrong-turn recovery:** if you go down the wrong path and capture a few unwanted waypoints, tap 🗑 on each (most-recent first) and confirm. Five taps clears five waypoints in under twenty seconds. Cleaner than re-running the stage.

### Voice waypoints (push-to-talk)

Tap **🎙 Record** and speak — RouteMapper locks your GPS at the moment of the tap, captures your spoken command, and creates a waypoint at the locked position. No wake word, no continuous listening; one button, your voice.

The button is the trigger because in real vehicles wake words fail too often — engine noise, wind, and headset compression all degrade speech recognition. A button tap is deterministic and works every time.

**Flow:**
1. Tap **🎙 Record** in the Voice panel — beep + the panel turns amber (*"📍 GPS locked"*). GPS is locked at this instant.
2. Speak your command: *type + icon + dash + note*.
3. After a short silence (default 2.5 s), the waypoint commits to the locked GPS position.
4. Say nothing for the snap window (default 5 s) and it auto-commits as a plain note.
5. Say **"cancel"**, **"discard"**, or **"abort"** to drop the pending waypoint. Or tap **⏹ Stop** on the button.

**Example commands:**

| You say | Result |
|---------|--------|
| *"hazard danger two — rocks on track"* | Hazard waypoint, Danger 2 icon, *"rocks on track"* note |
| *"left — onto gravel road"* | Nav waypoint, Left icon, *"onto gravel road"* note |
| *"left onto Forbes Road"* | Nav waypoint, Left icon, *"onto Forbes Road"* note |
| *"terrain washout"* | Terrain waypoint, Washout icon, no note |
| *"bump"* | Terrain waypoint, Bump icon (type inferred) |
| *"control fuel — stop for fuel"* | Control waypoint, Fuel icon, *"stop for fuel"* note |
| *"note — fuel stop ahead"* | Note waypoint, *"fuel stop ahead"* |
| *"caution"* | Nav waypoint, Caution icon (type inferred) |
| *"keep left"* | Nav waypoint, Keep Left icon |

You can omit the type if the icon name is unambiguous — *"left"* works as well as *"nav left"*.

**Three sliders** in the ⚙️ panel:
- **Silence timeout** — pause after speaking before the command fires (1.5–5 s)
- **Voice snap window** — how long after tapping 🎙 Record before auto-commit (3–10 s)
- **Snap window (edit after tap)** — for the manual tap flow, not Voice (2–10 s)

A Bluetooth headset with mic significantly improves accuracy in noisy or windy conditions.

#### External trigger (Bluetooth, foot pedal, presenter)

You can fire the 🎙 Record button without tapping the iPad. Useful when the iPad is mounted out of reach, or when both your hands are on the wheel.

**What works:**

- **Bluetooth headsets** that send standard media key events (most AirPods, Plantronics/Poly, Jabra). A single press of the play/pause button fires Record.
- **Bluetooth foot pedals** (AirTurn PED Pro, iKKEGOL, etc.) sending Page Up, Page Down, or media keys.
- **Wireless presenter clickers** (Logitech R500/R800, Satechi) sending Page Up / Page Down.
- **Bluetooth keyboards** — handy for testing the integration before buying specialised hardware. Press **Space**, **PageUp**, **PageDown**, or **F8**.

**A second press while recording cancels** the snap and returns to idle.

**Disabling the trigger:** in the ⚙️ Voice settings, uncheck **🎧 External trigger** if it ever fires accidentally. Default is on.

**Works alongside other audio apps:** while a stage is recording, RouteMapper claims the active Bluetooth media session — so a single press of your headset's play/pause button fires 🎙 Record, even if Spotify or Apple Music was playing a moment earlier. Music resumes its hold of the media buttons when you end the stage.

**Testing without specialised hardware:**

1. Pair a Bluetooth keyboard to your iPad.
2. Start a stage.
3. Tap somewhere outside any text field on the main map area.
4. Press **Space** — the 🎙 Record flow should fire as if you had tapped the button.

When the trigger is active, a small **🎧** icon appears next to "Voice" in the panel header.

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

> **Re-export warning:** if the stage has a roadbook, tapping **↓ Re-export ZIP** shows a confirmation dialog. Re-export regenerates `roadbook.docx` fresh from the stored stage data — any edits you have made to your existing DOCX copy (typo fixes, custom prose, formatting) live only on your device and will NOT be in the new ZIP. Cancel if you want to preserve those edits. The Drive Mode reader can overlay an edited DOCX on top of the JSON — see [Drive Mode → DOCX overlay](#docx-overlay-edit-notes-in-word) below.

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

## Drive Mode (Roadbook Reader)

Drive Mode is RouteMapper's in-vehicle roadbook reader. Load an exported stage (your own or one an event organiser has shared) and Drive Mode displays it as a scrolling roadbook that follows you down the road. The current row stays centred on screen, distance to the next instruction updates live, and you can optionally hear each row read aloud as you approach it.

Designed for rally co-drivers, but equally useful for walkers, cyclists, and motorbike riders following a pre-mapped route.

### Opening Drive Mode

- Tap the **🚗 Drive** pill in the top-right of the recording app, or
- Go directly to **[app.routemapper.net/drive](https://app.routemapper.net/drive)**

You'll see the source picker — a single big **📂 Load roadbook (ZIP or JSON)** button.

### Loading a roadbook

Drive Mode accepts:

- A **RouteMapper export ZIP** — the same ZIP that's generated when a stage ends. Drive Mode reads `Source/stage.json` for the roadbook structure, `trackPoints` for along-track distance, and (optionally) `Printable/roadbook.docx` for any text edits you've made (see below).
- A **bare `stage.json`** — extracted from a ZIP, or shared as a single file.

Older export layouts (with `*_stage.json` at the top level) also work — Drive Mode falls back automatically.

### What you'll see

```
┌─────────────────────────────────────────┐
│ Stage name · Day 1 · Stage 2     ⚙️  ✕  │  ← header
├─────────────────────────────────────────┤
│  11  ◯  Right                  0.42 km │
│  12  ◯  Bridge — slow          0.31 km │  ← above (dimmed)
│ ────────────────────────────────────── │  ← divider
│ ┃13  ●  Keep Left              0.18 km │  ← CURRENT (amber bar)
│ ┃    onto Forbes Road                  │
│ ────────────────────────────────────── │
│  14  ◯  Left at gate           0.65 km │  ← below
│  15  ◯  Straight               1.20 km │
├─────────────────────────────────────────┤
│ 🟢 GPS   next: 0.34 km   ⏸  ◀ ↺ ▶     │  ← footer
└─────────────────────────────────────────┘
```

The current row is highlighted in amber with a left rail. As you approach it, the **next: X km** distance counts down. The row auto-scrolls to stay centred even if you've manually scrolled away.

### Auto-advance

Drive Mode advances the current row automatically as you drive past each waypoint. The trigger is GPS proximity — when you enter the configured radius (default 30 m) of the next row's recorded position, it advances.

- **Tap a row** to jump to it manually
- **◀ ▶** to step one row back or forward
- **↺** to snap-scroll back to the current row if you've scrolled away to peek
- **⏸** to pause auto-advance entirely (resume with **▶**)

Tapping ◀ ▶ or a row triggers a 30-second pause on auto-advance, so it doesn't immediately re-advance you after a manual correction. Tune the pause duration in ⚙️ Settings.

### Distance display

The **next: X km** number in the footer is **along-track distance** — it follows the recorded GPS path, not straight-line. This matches the **kmPartial** values in your printed roadbook, so a navigator's verbal call-outs ("0.4 to the next") align with what they see on the iPhone.

If you drive off the recorded route by more than 100 m, the distance switches to straight-line and shows an **(off-track)** hint, so you know the number is approximate until you rejoin the route.

### Voice readout

Tap the **🔊** button in the header (green when on, grey when off) to toggle voice readout. When enabled, the device speaks each row as it becomes current:

> *"Keep left. Onto Forbes Road. Then 0.4 to the next."*

The announcement is composed from the icon/event word, your POI note (if it adds information beyond the icon), and the distance to the next row. Voice format defaults are tuned for rally navigation but the setting persists across sessions.

**iOS Safari first-time setup:** the very first speech announcement after page load needs a user gesture. Tapping the 🔊 button (which plays a short *"Voice ready"* priming utterance) handles this — subsequent auto-advance announcements then play without further interaction.

The same Settings panel toggle is also available under **⚙️ Voice readout** with a **🔊 Test voice** button.

### DOCX overlay — edit notes in Word

Want to polish row notes, fix typos, or add custom prose before driving? Drive Mode supports a **text-overlay** workflow:

1. End your stage and download the export ZIP
2. Extract the ZIP and open `Printable/roadbook.docx` in Word, Pages, or LibreOffice
3. Edit row notes — fix typos, add commentary, expand abbreviations
4. **Save the DOCX back in place** (in the Printable folder)
5. **Re-zip the export folder**
6. Load the new ZIP into Drive Mode

If Drive Mode detects an edited DOCX inside the loaded ZIP, it overlays the edited text on top of the JSON and shows a **📝 N edits** badge in the header indicating how many rows were overridden. Voice readout will speak the edited text.

**Scope and limits (replacement-only):**

- ✅ Edited row notes replace the JSON's notes for that row
- ✅ Voice readout uses the edited text
- ❌ New rows you add in Word that don't exist in the JSON are **not** shown (Drive Mode's row set is authoritative)
- ❌ Rows you delete from the DOCX are still shown in Drive Mode (deletion is not honoured)
- ❌ Tulip diagrams, distances, and GPS coordinates can't be edited — those come from the geometry

**Why this scope?** Edits to notes are safe and don't break the relationship between rows, distances, and tulips. Insertions and deletions would create rows the Drive Mode reader couldn't reconcile with the GPS-driven advancement. If you need to insert or remove rows, do it in RouteMapper itself (edit/delete waypoints) and re-export — but remember to re-do any DOCX text edits afterwards, since re-export starts from a fresh template.

### Settings

The **⚙️** button in the header opens the settings panel:

- **Auto-advance** — toggle the GPS-proximity advancement
- **Trigger radius** — 5–100 m (default 30 m). Larger values fire the advance earlier; smaller values fire later
- **Manual override pause** — 10–120 s (default 30 s). After tapping ◀ ▶ or a row, auto-advance pauses for this long before resuming
- **🔊 Voice readout** — on/off plus the **Test voice** button

All settings persist across sessions in localStorage.

### Plan gating

- **Free** — Drive Mode works for one loaded roadbook at a time (same limit as the recording side)
- **Solo / Pro** — unlimited loaded roadbooks, same as the recording side

The on-screen 🚗 Drive button is visible to all logged-in users including Guest Mode.

### Tips for using Drive Mode

- **Mount the iPhone in portrait orientation** within easy reach of the navigator (or in eye-line if solo-driving with voice readout on)
- **Test the trigger radius on your first stage** — 30 m default is good for typical recon driving, but on fast open roads 50–60 m gives more reading time
- **Use 🔊 voice with Bluetooth audio** — speakerphone over engine noise gets lost; a headset or car audio system is far clearer
- **Edit the DOCX before the event**, then save and re-zip ONCE. Re-exporting from RouteMapper Stage History wipes your DOCX edits

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

- **Charge your device** before recording or driving — GPS plus continuous display drains battery quickly.
- **Mount the iPad close to the navigator** so the 🎙 Record button is one easy reach away.
- **Voice pacing** — after tapping 🎙 Record, you have a short snap window to start speaking. Use a dash or natural pause to separate the icon from the note text.
- **Tune the snap windows** — the ⚙️ cog has three sliders. On open terrain, 3–4 s for voice snap is plenty; in tricky navigation, 7–8 s gives you room to think.
- **Bluetooth headset** — in a noisy vehicle or windy conditions, a headset mic dramatically improves voice accuracy. The same headset's play/pause button can also fire 🎙 Record — see [External trigger](#external-trigger-bluetooth-foot-pedal-presenter) above.
- **Stage History is read-only** — review past stages freely between live sessions; nothing gets overwritten.
- **Pre-load tiles** — pan around your area on a connection before going off-grid; cached map tiles render even when you lose signal.
- **Drive Mode trigger radius** — default 30 m works for typical recon. On fast open roads, bump to 50–60 m so the row advances earlier and gives the navigator more reading time.
- **Edit the DOCX once** — if you're polishing roadbook prose in Word/Pages, do it after the final recording and re-zip. Re-exporting from Stage History regenerates the DOCX and silently wipes your edits.

---

## Known Limitations

- **iOS background tracking** — switching away from RouteMapper while recording may pause GPS on iOS. Keep the app in the foreground.
- **Voice features** require a browser that supports the Web Speech API — best in Safari (iOS / iPad / macOS) and Chrome (Android / desktop). **On iOS, both Settings → Safari → Microphone AND Settings → Privacy & Security → Speech Recognition must allow Safari.** A common voice-recognition failure mode is the second of those being off.
- **Microsoft Edge speech recognition** is known to fail intermittently (it uses Microsoft's service rather than Google's). If 🎙 Record returns a "service unreachable" error in Edge, try Chrome or Safari on the same machine — they use different speech services and usually work.
- **Ad-blocking DNS** (pi-hole, NextDNS, AdGuard, Cloudflare for Families) can block the Google or Apple speech endpoints, breaking voice features network-wide. The friendly error message in Record will tell you when this is the cause.
- **Voice features need internet** — speech-to-text runs server-side at Google or Apple. The on-screen tap-based 🎙 Record button and manual Add Waypoint flow work fully offline; only the speech-to-text step requires connectivity.
- **Very large stages** — recordings with 1000+ track points may save slowly on older devices.
- **Offline cloud sync** — waypoint and track recording works fully offline; data syncs automatically when connectivity returns.
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
