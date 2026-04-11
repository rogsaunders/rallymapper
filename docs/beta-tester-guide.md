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
Try all three methods:

1. **Manual text**: Type a note in the POI text field (e.g. "Junction with gravel road"), select an icon type, then tap **Add Waypoint (Current GPS)**
2. **Voice dictation**: Tap the **Dictate** button, speak your note, then tap **Add Waypoint (Current GPS)**
3. **Different icon types**: Try adding waypoints with Hazard, Navigation, Control, and Note icons

- **Expected**: Each waypoint appears in the Waypoints panel with its type, time, and distance from the previous waypoint

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
- **Voice dictation**: Not available in all browsers. Works best in Safari (iOS) and Chrome (Android/desktop).
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
- **Use a phone mount** if recording while driving
- **Don't worry about breaking things** — that's the whole point of a beta!

---

Thank you for helping us make RouteMapper better!
