# Route Mapper - Complete Rally Stage Workflow

**Version 7 | April 2026**

Route Mapper is designed for anyone logging routes during competitive rallies, fun runs, fundraising events, outback tours, or family adventures. Mount your iPad, press Start, and the app captures every turn, hazard, and landmark — then produces a professional roadbook at the end.

---

## Pre-Stage Setup

1. Mount iPad in passenger/navigator position with Route Mapper open
2. Check GPS status — the GPS panel displays "Live: (lat, lon)" when a fix is acquired, or "Live: Waiting for GPS..." if still locking on
3. Enter your **Trip Name** in the text field (e.g., "Flinders Ranges 2025")
4. Set the **Trip Date**
5. Confirm **Day**, **Route**, and **Stage** numbers are correct (use New Day / New Route / New Stage buttons as needed)
6. Optional: Connect a headset for hands-free voice operation

---

## Stage Start Process

1. Press the green **Start Stage** button
2. GPS tracking begins — track points are recorded every 5 seconds (with a minimum 5m movement threshold to filter GPS jitter)
3. Press **Start Set (tap to update)** to capture your current GPS position as the stage start point. This can be updated at any time during the stage by pressing again
4. Three waypoint input methods are now available:
   - **Add Waypoint** — icon selector with typed or dictated notes
   - **Hands-Free Voice** — wake-word activated, fully voice-controlled
   - **Dictate** — voice-to-text for the note/POI field

---

## Setting the Start Position

Unlike a simple "press go" approach, Route Mapper separates stage start from the start position:

- **Start Stage** begins GPS tracking and enables all input controls
- **Start Set (tap to update)** captures your current GPS coordinates as the official start point
- The start position appears on the map as a distinct blue circle marker
- You can update the start position at any time by pressing the button again — useful if you need to reposition before the stage truly begins
- The start point is automatically included as the first entry in all exports

---

## During Rally Stage (Active Navigation)

### Waypoint Types and Icons

Route Mapper organises waypoints into five types, each with specific icon variants:

| Type | Icons Available |
|------|----------------|
| **Note** | Note (general purpose) |
| **Hazard** | Danger 1, Danger 2, Danger 3 |
| **Terrain** | Bump, Bumps, Dip, Twisty, Ruts, Washout, Up Hill, Down Hill |
| **Nav** | Left, Right, Keep Left, Keep Right, Straight, Gate, Cattle Gate, Railroad, Give Way, Caution |
| **Control** | Start, Finish, Stop, Checkpoint, Time Control, Fuel, Service |

That's **41 icons** across 5 categories — covering everything from standard navigation to rally-specific hazards and control points.

---

### Method 1: Snap-First Tap (Recommended for Speed)

Route Mapper uses a **snap-first** flow — GPS is locked the instant you tap, eliminating position drift while you choose an icon. At 100 kph, a 2–5 second delay between tap and commit can mean 50–140 m of error; now the fix is instant.

1. Press **Add Waypoint (Current GPS)** — GPS is captured *instantly* and a pending amber card appears with a countdown
2. Within the edit window (default **5 seconds**), select the waypoint **type** and **icon variant** and/or enter a POI note
3. The waypoint auto-commits when the countdown ends — or tap **✓ Done** to commit early, or **Discard** to cancel

The pending waypoint appears as a dashed amber circle on the map. When it commits it switches to the solid icon marker.

**Tips:**
- Your last-used type and icon are pre-selected when the card appears — for a stream of same-type waypoints just tap and let it commit
- A second tap while the card is pending auto-commits the first waypoint and snaps a new one instantly
- Adjust the edit window (2s–10s) via the **Snap window (edit after tap)** slider in the Hands-Free ⚙️ settings
- Dictate a note while the card is pending — the voice text fills the POI field before auto-commit

### Method 2: Hands-Free Voice Commands

For fully voice-controlled operation — ideal when both hands are occupied or during fast-paced stages.

**Setup:**
1. Press **Activate** in the Hands-Free panel
2. The panel turns blue with "Say 'Mapper'" — the system is now listening for the wake word
3. Optionally adjust settings via the ⚙️ gear icon:
   - **Silence timeout** (1.5s–5s) — how long after you stop speaking before the command is processed
   - **Voice snap window** (3s–10s) — how long you have to speak a command after "Mapper" before the waypoint auto-commits with the last-used icon

**Adding a waypoint by voice:**
1. Say **"Mapper"** — the panel turns amber with "📍 GPS locked — say type or wait Ns" and an audio beep confirms. **The GPS position is locked at this instant**, regardless of when you finish speaking.
2. Speak your command using the format: `[type] [icon] — [notes]`
3. After the silence timeout, the command is processed and the waypoint is committed to the locked GPS position
4. If you say nothing within the configured voice snap window (default 5 s), the waypoint auto-commits using the previously selected type and icon
5. Say **"cancel"**, **"discard"**, or **"abort"** to discard the pending waypoint and return to standby
6. A confirmation toast appears at the top of the screen (e.g., "HAZARD — danger_2: rocks on track")
7. The system returns to standby, ready for the next "Mapper" wake word

**Voice command examples:**

| You say | Result |
|---------|--------|
| "Mapper... hazard danger two — rocks on track" | Hazard waypoint with Danger 2 icon |
| "Mapper... left — onto gravel road" | Nav waypoint with Left Turn icon |
| "Mapper... terrain washout" | Terrain waypoint with Washout icon |
| "Mapper... bump" | Terrain waypoint with Bump icon |
| "Mapper... control fuel — stop for fuel" | Control waypoint with Fuel icon |
| "Mapper... note — fuel stop ahead" | Note waypoint |
| "Mapper... caution" | Nav waypoint with Caution icon |
| "Mapper... keep left" | Nav waypoint with Keep Left icon |

**Type keywords:** note, hazard, danger, nav, navigation, turn, control, checkpoint, terrain

**Tips:**
- You can omit the type if the icon name is unambiguous — "Mapper... left" works as well as "Mapper... nav left"
- Use a short pause or the word "dash" to separate the icon from the note
- The wake word detection handles common speech recognition variations ("map", "map a", "map her" are all recognised)
- Audio beeps confirm when GPS is locked (wake word) and when the command is committed
- The GPS position is snapped at the moment "Mapper" is recognised — not when the command finishes — minimising positional error at speed
- Speech recognition uses Australian English (en-AU)

### Method 3: Dictation (Voice-to-Text for Notes)

For adding spoken notes to a waypoint selected via the icon buttons:

1. Select your waypoint type and icon as in Method 1
2. Press the **Dictate** button (shows "Dictate" in green)
3. The button changes to "Listening..." in red
4. Speak your note naturally — it appears as text in the POI field
5. Recognition stops automatically after a pause
6. Review or edit the text, then press **Add Waypoint (Current GPS)**

---

## Real-Time Monitoring

### GPS Panel
- **Live GPS** — shows current coordinates or "Waiting for GPS..."
- **Start GPS** — shows captured start position or "Not set"
- **Follow Map** checkbox — when enabled, the map auto-pans to your current location

### Map View
- Collapsible map panel — press **Hide Map** / **Show Map** to toggle
- **Full Screen** mode for detailed route review
- Three tile sources available:
  - **OpenStreetMap** — standard road map (default)
  - **OpenTopoMap** — topographic with contour lines (great for outback)
  - **Esri Imagery** — satellite/aerial photography
- Map markers:
  - **Blue circle** — stage start position
  - **Blue dot** — current GPS location
  - **Waypoint icons** — SVG icons matching the selected type
  - **Red polyline** — GPS track showing the route taken
  - **Distance labels** — segment distances between waypoints

### Waypoint List
Each waypoint displays:
- Index number (START, WP 1, WP 2, etc.)
- Type and icon badge (e.g., "hazard:danger_1")
- POI text / description
- Timestamp (HH:MM:SS)
- Segment distance from previous waypoint (km)
- Total distance from start (km)

### Roadbook Preview
- Press **Roadbook Preview** to see the auto-generated roadbook as it builds
- Shows roadbook rows with turn events, distances, and confidence levels
- Displays track point count and candidate count statistics
- Preview updates as you add waypoints and record track data

---

## Stage End Process

1. Press the red **End Stage** button — the button briefly shows "Ending..." while processing
2. The app automatically:
   - Generates a roadbook from your GPS track and waypoints (detecting turns, classifying events, calculating confidence)
   - Saves the stage data locally
   - Builds a comprehensive **ZIP export package** (see Export Formats below)
   - Downloads the ZIP to your device
   - Syncs to the cloud if signed in and online (queues for later if offline)
3. The stage is saved to **Stage History** and synced to the cloud (if online). Waypoints and track remain on screen until you tap **Start New Stage**
4. Tap **Start New Stage** to clear the map and increment the stage counter — ready for the next stage

There is no confirmation dialog — ending a stage immediately processes and exports.

---

## Export Package

When a stage ends, Route Mapper produces a ZIP file containing a comprehensive set of exports:

### Core Files
| File | Description |
|------|-------------|
| **Master JSON** | Complete stage data including all waypoints, track points, roadbook, and metadata |
| **Track GPX** | Raw GPS track points from the entire stage |
| **Waypoints GPX** | All manually added waypoints plus the start point |
| **Combined GPX** | Track and waypoints together in a single file |
| **Map PDF** | Printable A4 landscape map showing the route, waypoint markers, distance, and waypoint count |

### Roadbook Files
| File | Description |
|------|-------------|
| **Roadbook JSON** | Structured roadbook rows with full metadata |
| **Roadbook CSV** | Two versions — raw (all events) and driver (filtered high-confidence events) |
| **Roadbook HTML** | Formatted roadbook with tulip turn diagrams |
| **Roadbook DOCX** | Word document with professional formatting |

### Device-Specific Exports
| Folder | Target |
|--------|--------|
| **hema/** | Hema Navigator |
| **garmin/** | Garmin GPS devices |
| **rallynav/** | Rally Navigator |
| **google-earth/** | Google Earth (KML) |
| **gaia/** | Gaia GPS |

The ZIP also includes a `manifest.json` (package metadata and file listing) and a `README.md`.

### OpenRally Compliance
GPX exports include OpenRally extensions:
- Distance markers (km)
- Bearing/heading (0–360 degrees)
- Tulip diagrams (Base64-encoded PNG)
- Metric units throughout

---

## Stage History

Every completed stage is automatically saved and accessible at any time via the **History** button in the stage control row.

### Accessing History

1. Tap the green **History** button (visible whenever a stage is not actively recording)
2. A panel lists your last 20 stages, newest first — showing date, stage name, distance, and waypoint count
3. Tap **Open** on any row to load that stage in review mode

### Review Mode

When a historical stage is open:
- The map switches to display that stage's route and waypoints (live GPS is not shown)
- An amber banner shows the stage name and date
- Tap **↓ Re-export ZIP** to download the full export package for that stage again
- Tap **Close Review** to return to the normal screen

Review mode is **read-only** — opening a past stage does not affect the current session or any saved data.

### Map PDF (mid-stage)

You can also export a printable map at any point during an active stage — tap **Export Map PDF** in the map controls. Useful for sharing a route overview before the stage ends.

---

## Roadbook Generation

The roadbook is the primary output of Route Mapper. It transforms your raw GPS track and manual waypoints into a structured, professional rally roadbook.

### How It Works

1. **Track simplification** — GPS noise is smoothed out (5m minimum spacing, 12m tolerance)
2. **Turn detection** — Heading changes greater than 25 degrees are identified as turn candidates
3. **Classification** — Each turn is classified (left 90, right 90, bear left, bear right, straight, etc.)
4. **Waypoint merging** — Your manual waypoints are snapped to detected events within 20m
5. **Confidence scoring** — Each event receives a confidence rating based on track data quality
6. **View generation** — Two views are produced:
   - **Raw view** — all detected events for detailed review
   - **Driver view** — filtered to high-confidence events (85%+) with clustering to remove noise

### Roadbook Output
Each roadbook row contains:
- **Cumulative distance** (km from start)
- **Partial distance** (km from previous event)
- **Event type** (turn direction, hazard, control point, etc.)
- **Tulip diagram** (SVG turn illustration)
- **Bearing in/out and turn angle**
- **Notes** from manual waypoints
- **Source** — whether the event was auto-detected from GPS or manually added
- **Confidence score**

---

## Multi-Stage Events

Route Mapper supports a **Trip > Day > Route > Stage** hierarchy for multi-day events:

- **Trip Name** — the overall event (e.g., "Flinders Ranges 2025")
- **New Day** — increments the day number, resets route and stage numbers
- **New Route** — increments the route number within the current day, resets stage number
- **New Stage** — increments the stage number within the current route

Day, Route, and Stage controls are disabled while a stage is active. Between stages, the app stays ready with previous data already exported.

**Route Name** is editable — give each route a descriptive name (e.g., "Wilpena Pound Loop").

---

## Authentication and Cloud Sync

### Guest Mode
- No account required — all features work without signing in
- Data is stored locally on the device
- Exports download directly to the device

### Signed-In Mode
- Sign in with email and password via Supabase
- Stage data syncs to the cloud automatically on stage end
- If offline, stages are queued and sync when connectivity returns

### Cloud Status Indicator (Header)
| Indicator | Meaning |
|-----------|---------|
| **Synced** (green) | Authenticated, online, all data synced |
| **Pending (N)** (yellow) | N stages waiting to sync |
| **Offline** (red) | No internet connection |
| **Guest** (grey) | Guest mode — local storage only |

---

## Quick Corrections

- **Wrong icon selected:** Change the type/icon buttons while the pending amber card is still counting down — the selection updates the pending waypoint before it commits
- **Mis-tap / wrong position:** Tap **Discard** on the pending card before the countdown expires to cancel the waypoint entirely
- **Wrong waypoint already committed:** Note the error during the stage — correct it during post-stage review of the exported data

---

## Error Recovery

- **GPS loss:** The GPS panel clearly shows "Waiting for GPS..." — reposition the device for a better signal
- **Voice recognition issues:** Use the icon selector as a reliable backup — it works without speech
- **App crash / battery loss:** Stage data auto-saves to local storage, providing a recovery point
- **Export issues:** Data is saved locally regardless of export success
- **Offline:** All features work without internet. Cloud sync queues stages for later upload

---

## Workflow Decision Tree

```
Which input method should I use?

+-- Standard instruction (turn, hazard, grid)?
|   --> Icon Selector (fastest, 100% accurate)
|
+-- Hands occupied / fast pace?
|   --> Hands-Free Voice ("Mapper... left")
|
+-- Complex or unique description?
|   --> Icon Selector + Dictated note
|
+-- Voice recognition struggling?
    --> Icon Selector + typed note (always works)
```

---

## Typical Timing

| Action | Time |
|--------|------|
| Stage start | ~5 seconds (GPS lock + start set) |
| Icon waypoint (no note) | ~2 seconds |
| Icon waypoint (with typed note) | ~5 seconds |
| Icon waypoint (with dictated note) | ~4 seconds |
| Hands-free voice waypoint | ~3–4 seconds (GPS locked at wake word; command window configurable) |
| Stage end (processing + export) | ~15–20 seconds |

---

## Method Comparison

| Feature | Icon Selector | Hands-Free Voice | Dictation |
|---------|--------------|-------------------|-----------|
| Speed | Fastest | Fast | Moderate |
| Accuracy | 100% | 95%+ | 95%+ |
| Hands-free | No | Yes | Partially |
| Standardised icons | Yes | Yes | N/A (text only) |
| Complex descriptions | Needs typing/dictation | Natural speech | Natural speech |
| Best for | Standard rally instructions | Fast-paced stages | Detailed notes |
| Works offline | Yes | Yes | Yes |
| Battery impact | Minimal | Moderate | Moderate |

---

## iPad Optimisation

- **Landscape mode:** Icon grids and two-column layout fit well
- **GPS settings:** High accuracy enabled, 20-second timeout, fresh reads
- **Location permissions:** Set to "While Using" with "Precise Location" ON
- **PWA support:** Can be added to the home screen for app-like experience
- **Offline capable:** All features work without internet
- **File export:** ZIP downloads directly to the device

---

## Supported Export Targets

| Target | Format | Notes |
|--------|--------|-------|
| Rally Navigator | GPX | Waypoint numbering (WP001, WP002...), icon mappings, route instructions as comments |
| Hema Navigator | GPX | Hema-compatible track and waypoint format |
| Garmin | GPX | Garmin device-compatible format |
| Google Earth | KML | Full route visualisation with placemarks |
| Gaia GPS | GPX | Gaia-compatible format |
| OpenRally | GPX extensions | Distance, bearing, tulip diagrams, metric units |
| General use | JSON, CSV, HTML, DOCX | Roadbook in multiple formats for printing, sharing, and analysis |

---

*Route Mapper is optimised for real-world rally survey conditions where the navigator needs to capture precise route information quickly and accurately. The icon selector provides the fastest method for standard instructions, hands-free voice handles high-pace situations, and the comprehensive export package ensures your data works with whatever device or software you use next.*
