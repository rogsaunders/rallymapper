# RouteMapper Beta — Getting Started

Welcome to the RouteMapper private beta! Thank you for volunteering your time to help us test. This guide covers everything you need to get started.

---

## Your Login

- **URL**: [beta.app.routemapper.net](https://beta.app.routemapper.net)
- **Email**: *(provided to you separately)*
- **Password**: *(provided to you separately)*

After your first sign-in, we recommend changing your password: tap **Forgot password?** on the sign-in page and follow the email link.

---

## Installing the App

RouteMapper is a Progressive Web App (PWA). For the best experience, install it to your home screen:

### iPhone / iPad (Safari)
1. Open [beta.app.routemapper.net](https://beta.app.routemapper.net) **in Safari** (not Chrome)
2. Tap the **Share** button (square with arrow)
3. Scroll down and tap **Add to Home Screen**
4. Tap **Add**

### Android (Chrome)
1. Open [beta.app.routemapper.net](https://beta.app.routemapper.net) in Chrome
2. You should see an **"Install app"** banner — tap it
3. If no banner appears: tap the three-dot menu → **Install app** or **Add to Home Screen**

> **Important**: Keep RouteMapper in the foreground while recording a route. On iOS, switching to another app may pause GPS tracking.

---

## Supported Browsers

| Browser | Status |
|---------|--------|
| Safari (iOS/iPad) | Recommended for Apple devices |
| Chrome (Android) | Recommended for Android |
| Chrome (desktop) | Supported |
| Edge (desktop) | Supported |
| Firefox | Works, but PWA install not supported on mobile |

---

## What's New — April 2026

We've flipped the waypoint capture flow so your GPS coordinate is locked the moment you tap — no more position drift while you choose an icon. At 100 kph, the old 2–5 second delay between tap and commit could mean 50–140 m of error; now the fix is instant.

**The new flow:**

1. Tap **Add Waypoint (Current GPS)** — GPS is captured *instantly* and a pending amber card appears with a countdown.
2. Within the edit window (default **5 seconds**), refine the icon type and/or type a POI note.
3. The waypoint auto-commits when the countdown ends, or tap **✓ Done** to commit early, or **Discard** to cancel.

On the map, the pending waypoint appears as a dashed amber circle. When it commits, it switches to the normal solid icon.

A few extras:

- **Adjustable edit window** — the Hands-Free settings cog now has a second slider for the snap window (2s fast → 10s relaxed).
- **Voice while pending** — Hands-Free or Dictate commands during the edit window refine the pending waypoint instead of creating a new one.
- **Second tap while pending** — auto-commits the first waypoint and snaps a new one instantly.
- **Button moved** — the Add Waypoint button now sits at the top of the Input Controls panel to match the tap-first workflow.

---

## Guided Test Script (Phase 1)

Please work through these steps and note anything that feels confusing, slow, or broken.

### Step 1 — Sign in
- Open the app and sign in with your provided credentials
- **Expected**: You see the main RouteMapper screen with a map and control panels

### Step 2 — Set up a stage
- Enter a **Trip name**, **Day**, **Route**, and **Stage name** in the fields at the top
- **Expected**: The fields accept your input and are visible

### Step 3 — Start recording
- Tap the green **Start Stage** button
- Allow location access when prompted
- **Expected**: Your position appears on the map. The GPS panel shows live coordinates.

### Step 4 — Record a short route
- Walk or drive a short route (5-10 minutes is plenty)
- Watch the map — you should see a breadcrumb trail of your track
- **Expected**: Track points appear on the map as you move

### Step 5 — Add waypoints

The new snap-first flow: **tap first, refine second**. Your GPS position locks the moment you tap Add Waypoint; you then have a short window to choose the icon and/or note.

Try all four methods:

1. **Tap-then-refine**: Tap **Add Waypoint (Current GPS)** — a pending amber card appears with a countdown. Before it expires, select an icon type (e.g. Hazard → Danger 2) and/or type a note in the POI field. Tap **✓ Done** to commit immediately, **Discard** to cancel, or just let it auto-commit.
2. **Voice dictation**: Tap **Add Waypoint** first, then tap **Dictate** and speak your note while the pending card is active. The spoken text fills the POI field before auto-commit.
3. **Different icon types**: Try Hazard, Navigation, Control, Terrain, and Note icons. Your last-used type persists, so for a stream of same-type waypoints you just tap → let it commit.
4. **Hands-Free voice mode** *(for solo drivers)*:
   - Tap **Activate** in the Hands-Free panel
   - The panel shows a blue dot and **Say "Mapper"** — the app is listening for the wake word
   - Say **"Mapper"** — you'll hear a start tone and the panel turns red (**Listening...**)
   - Speak your command using the format: *type + icon + dash + note*
     - Examples: "hazard danger two — deep ruts ahead", "left — onto gravel road", "terrain washout", "bump", "note — fuel stop in 5 km"
   - After a short silence (default 2.5s), the waypoint is automatically created and a green confirmation toast appears
   - If a pending waypoint already exists, the voice command refines it rather than creating a new one — use this to correct or annotate a tap-captured waypoint hands-free
   - The app returns to standby, ready for the next "Mapper" command
   - Tap **Stop** to deactivate
   - Use the settings cog to adjust the **silence timeout** (1.5s–5s) *and* the **snap edit window** (2s–10s)

- **Expected**: While pending, a dashed amber circle appears on the map at the captured GPS position. Once committed, it switches to the solid icon marker and appears in the Waypoints panel with its type, icon, time, and distance from the previous waypoint.

### Step 6 — Stop recording
- Tap the red **End Stage** button
- **Expected**: The app generates a roadbook, saves your data, and offers an export (ZIP file)

### Step 7 — Check the export
- Open the downloaded ZIP file
- Inside you should find: GPX files, CSV files, KML, HTML roadbook, and a master JSON
- Open the **HTML roadbook** in a browser
- **Expected**: A formatted roadbook with waypoint rows, distances, and turn diagrams

### Step 8 — Revisit a saved stage
- Close and reopen the app
- Your saved stage should still be available
- **Expected**: Your route data persists between sessions

---

## How to Report Issues

When something goes wrong or feels off, please tell us! Here's what helps most:

**What to include:**
- What you were doing (e.g. "I tapped Add Waypoint after dictating a note")
- What happened (e.g. "The waypoint was added but the voice text was missing")
- What you expected to happen
- A screenshot or screen recording if possible
- Your device and browser (e.g. "iPhone 14, Safari" — or visit [whatismybrowser.com](https://www.whatismybrowser.com) and share the result)

**Where to report:**

- **Quick questions or "is this a bug?"** — post in the WhatsApp group: *(INSERT GROUP LINK)*
- **Actual bug reports** — fill in the short form: *(INSERT GOOGLE FORM LINK)*

Even small things matter — if something felt confusing or you hesitated, that's worth reporting.

---

## Known Limitations

These are things we already know about — no need to report them:

- **iOS background tracking**: If you switch away from RouteMapper while recording, iOS may pause GPS tracking. Keep the app in the foreground.
- **Voice dictation & Hands-Free**: Requires a browser that supports the Web Speech API. Works best in Safari (iOS/iPad) and Chrome (Android/desktop). Hands-Free mode uses the device microphone continuously while active — a Bluetooth headset with mic significantly improves accuracy in noisy/windy conditions.
- **Large stages**: Very long recordings (1000+ track points) may be slow to save on some devices.
- **Offline mode**: The app works offline, but your data won't sync to the cloud until you're back online.

---

## Your Data & Privacy

- Your GPS tracks and waypoint data are stored in our cloud database (hosted by Supabase in the US)
- We use this data solely for testing and improving RouteMapper
- All beta test data will be deleted at the end of the trial
- Crash reports are collected via Sentry (no personal data, just error details and device info)

If you have any concerns about your data, please reach out.

---

## Tips

- **Charge your device** before recording — GPS usage drains battery quickly
- **Use a phone mount** if recording while driving — essential for Hands-Free mode
- **Hands-Free driving tip**: Speak clearly and leave a brief pause after "Mapper" before your command. The dash separator ("dash" or a natural pause) separates the icon type from your note text.
- **Tune the snap edit window**: If 5s feels too fast (or too slow), the Hands-Free settings cog has a slider (2s–10s). On open terrain 3–4s is plenty; in tricky navigation or when switching icon categories, 7–8s gives you room to think.
- **Bluetooth headset**: If you're surveying in a noisy vehicle or windy conditions, a Bluetooth headset with mic dramatically improves voice recognition accuracy
- **Don't worry about breaking things** — that's the whole point of a beta!

---

Thank you for helping us make RouteMapper better!
