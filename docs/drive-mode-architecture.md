# Drive Mode — Architecture (MVP)

**Status:** Approved 2026-05-23. Implementation begins at Milestone 1 (skeleton). See [Phase 2 plan](#milestones) for the 8–12 week breakdown.

This document captures the architectural decisions that the design dialog converged on. It is intentionally short. Anything not decided here is deferred to Phase 3.

---

## 1. Goal

Drive Mode is RouteMapper's in-vehicle Roadbook Reader. It loads a previously-recorded stage and presents the roadbook to a navigator while the vehicle drives the stage, advancing the current row by GPS proximity and speaking turn instructions aloud.

It is **purely additive** to the recording side. The Drive Mode build does not modify any code paths used to capture stages, generate roadbooks, or build export ZIPs. It consumes the existing roadbook JSON read-only.

## 2. Scope — MVP

**In:**

- Single stage at a time, pre-recorded (no live record-then-drive).
- Source: `Source/stage.json` from a RouteMapper export ZIP, OR loaded directly from the user's saved-stage list.
- Layout: scrolling HTML-style roadbook, current row sticky/auto-scrolled into view.
- Auto-advance by GPS proximity with manual Prev/Next override.
- Voice readout on row change, with on/off toggle.
- Works in both portrait and landscape orientation, responsively.
- Free tier: 1 stage at a time (mirrors recording). Solo / Pro: unlimited.
- Lives at `app.routemapper.net/drive` — same app, new route.

**Out (Phase 3):**

- Multi-stage chaining.
- PDF source parsing.
- Live shared sessions (driver and navigator on separate devices).
- Stage replay against a recorded baseline ("how do my times compare to last year?").
- Walker / cyclist / motorbike-specific profile presets.

## 3. URL and access

| Path | Behaviour |
|---|---|
| `/drive` | Source picker — saved stages (if logged in) + "load from ZIP" button (any user) |
| `/drive/:stageId` | Logged-in user opens one of their saved stages directly |
| `/drive/local` | Stage loaded from a user-uploaded ZIP (no auth required) |

Plan gating mirrors the recording side: Free users can drive one stage at a time, Solo/Pro unlimited. Enforcement happens at the source-picker step.

## 4. File layout

```
src/drive/
├── DriveMode.jsx              top-level route component
├── components/
│   ├── SourcePicker.jsx       saved-stage list + ZIP loader
│   ├── RoadbookView.jsx       the scrolling roadbook container
│   ├── RoadbookRow.jsx        one row (tulip + distance + CAP + notes)
│   ├── HeaderBar.jsx          stage name, exit, ⏸ pause, ⋯ menu
│   ├── FooterBar.jsx          Prev / Snap-to-current / Next + km-to-next
│   └── SettingsPanel.jsx      trigger radius slider, voice toggle, etc.
├── hooks/
│   ├── useRoadbook.js         load + parse the source (JSON, future DOCX)
│   ├── useDriveAdvance.js     row-advancement state machine
│   └── useVoiceReadout.js     speechSynthesis integration
├── lib/
│   ├── tulipAdapter.js        thin wrapper calling renderTulipSvg
│   ├── advanceLogic.js        pure functions: proximity + cumulative checks
│   └── docxPatch.js           DOCX text-only overlay parser (M5)
└── DriveMode.module.css       any styles not expressible in Tailwind
```

Drive Mode does NOT touch:

- `src/RouteMapperLayout.jsx` (except adding a single menu item to launch `/drive`)
- `src/export/*` (the export pipeline)
- `src/roadbook/roadbookHtmlExport.js` (the HTML roadbook generator)
- `src/voice/*` (push-to-talk capture)

## 5. Component hierarchy

```
DriveMode
├── SourcePicker                  (when no roadbook loaded)
└── (when loaded:)
    ├── HeaderBar
    ├── RoadbookView
    │   └── RoadbookRow × N       (current row gets sticky/highlighted styling)
    ├── FooterBar
    └── SettingsPanel             (collapsible overlay)
```

## 6. State management

React state only. No new global library.

- **Local state** in `DriveMode`: loaded roadbook, current row index, mode (`idle | armed | driving | paused | ended`), settings (trigger radius, voice on/off).
- **Hooks** encapsulate concerns: `useRoadbook` (loader), `useDriveAdvance` (proximity + cumulative logic), `useVoiceReadout` (speechSynthesis).
- **Settings persist** to localStorage under `rm_drive_*` keys.

## 7. GPS subscription

Reuse the existing GPS hook from the recording side (currently inline in `RouteMapperLayout.jsx` — refactor to `src/hooks/useGpsStream.js` when needed for the Drive Mode work). Same accuracy filtering, same fallback behaviour.

If the recording side's GPS code can't be cleanly extracted at M2, Drive Mode gets its own copy temporarily, and we DRY it up in a follow-up commit.

## 8. Source loading

**JSON path (M1):** Accept a file picker. Read JSON. Validate roadbook structure (must have `rows` array with `{lat, lon, kmTotal, tulipTemplate, bearingIn, bearingOut, ...}`). Hand to `DriveMode`.

**Saved stages (M2):** For logged-in users, fetch their Supabase stage list and present a picker. Selecting one loads the roadbook from the cloud-stored JSON.

**DOCX patch layer (M5):** If a user uploads a DOCX *in addition to* the JSON (or it's bundled in the ZIP at `Printable/roadbook.docx`), parse it for text-only edits (notes, custom prose) and apply as overlay to the JSON-loaded rows. Source of truth remains the JSON; DOCX is patches.

**PDF (Phase 3):** Not in MVP.

## 9. Auto-advance algorithm

The driving state machine has one goal: keep `currentRowIndex` aligned with where the vehicle actually is.

**Trigger zone advance** (primary):

```
For each row r at index i > currentRowIndex:
  if haversineMeters(gps, r) <= triggerRadiusM (default 30 m):
    currentRowIndex = i; speak(row); break
```

**Cumulative-distance advance** (fallback):

```
If cumulativeKmTravelled exceeds nextRow.kmTotal by more than triggerRadiusM:
  advance to that row (user passed without entering the trigger zone — common when
  the recorded waypoint is offset from the actual driving line).
```

**Manual override:** Prev / Next buttons set `currentRowIndex` directly. After a manual override, auto-advance pauses for 30 s to avoid yanking control back from the navigator.

All advance logic lives in `lib/advanceLogic.js` as pure functions for testability.

## 10. Tulip rendering — adapter pattern

`tulipAdapter.js` is a thin wrapper:

```js
// src/drive/lib/tulipAdapter.js
import { renderTulipSvg } from "../../roadbook/tulipRenderer"; // adjust path as needed

export function tulipForRow(row) {
  return renderTulipSvg({
    template: row.tulipTemplate,
    bearingIn: row.bearingIn,
    bearingOut: row.bearingOut,
    angle: row.angle,
    icon: row.icon,
  });
}
```

If `renderTulipSvg` ever changes signature, this one file is the only place to update.

## 11. Voice readout

`useVoiceReadout` wraps `window.speechSynthesis`. On row change:

```
const text = `${row.icon}. ${row.notes ?? ''}. In ${kmToNext.toFixed(2)} kilometers.`;
speechSynthesis.cancel(); // drop any in-progress utterance
speechSynthesis.speak(new SpeechSynthesisUtterance(text));
```

Configurable: voice on/off (default on), rate (default 1.0, slider in settings later if needed), language (default `en-AU` to match recording side).

## 12. Layout — orientation-agnostic

Drive Mode does NOT prescribe portrait or landscape. The scrolling roadbook reflows responsively. CSS uses flex/grid + viewport units so a single stylesheet serves both orientations on iPad, plus phones in portrait for a future cyclist use case.

Each row's internal layout (tulip on the left, instructions on the right, distances on the far right) collapses to vertical stacking on narrow viewports.

## 13. Configurable parameters (visible in SettingsPanel)

| Setting | Default | Range | Purpose |
|---|---|---|---|
| Trigger radius | 30 m | 5–100 m | How close to a waypoint counts as "arrived" |
| Voice readout | on | on / off | Whether to speak row changes |
| Voice rate | 1.0 | 0.7–1.4 | Speech speed |
| Auto-advance | on | on / off | If off, user manually advances |

All persisted to `localStorage` under `rm_drive_*` keys.

## 14. Constraints

- Drive Mode must NOT modify the recording side's behaviour.
- Drive Mode must work offline once a roadbook is loaded (no cloud calls during driving).
- Page must survive an accidental tap on the home indicator (PWA behaviour). If iOS does background the page, the session resumes cleanly on return.
- No silent-audio loop is needed in Drive Mode (push-to-talk recording is not active during driving).

## 15. What this doc does NOT decide

- PDF parsing (Phase 3)
- Multi-stage chaining (Phase 3)
- Walker / cyclist / motorbike presets (Phase 3 — design hooks exist via configurable parameters)
- Cloud-shared driver/navigator sessions (Phase 3)
- Detailed visual design (covered in M1's design pass during the skeleton build)
- Pricing or marketing message for Drive Mode

## 16. Milestones

| M | Weeks | What ships |
|---|---|---|
| **M1 — Skeleton** | 1–2 | `/drive` route, JSON loader, static scrolling display, header + footer chrome. No GPS yet. |
| **M2 — GPS integration** | 3–4 | Live GPS subscription, current-row highlight + auto-scroll, distance-to-next display. No auto-advance yet. |
| **M3 — Auto-advance** | 5–6 | Proximity-zone advancement, Prev/Next manual override, snap-to-current, pause/resume. |
| **M4 — Voice readout** | 7 | speechSynthesis integration, on/off toggle. |
| **M5 — DOCX patch + polish** | 8–10 | DOCX text-overlay parsing, orientation polish, glove-friendly audit. |
| **M6 — Field test + iterate** | 11–12 | Real recon-to-event test, tweaks. |

## 17. Test plan for M1 (skeleton)

When M1 lands, you should be able to:

1. Navigate to `app.routemapper.net/drive` and see the source picker.
2. Click "Load ZIP" and select a recently-exported RouteMapper ZIP. Roadbook renders as a scrolling list.
3. Confirm tulips render correctly (via `tulipAdapter`).
4. Confirm scrolling works in both portrait and landscape on iPad.
5. Confirm the header shows the stage name and an Exit button that returns to `/`.
6. No GPS, no auto-advance, no voice yet — that's M2+.
