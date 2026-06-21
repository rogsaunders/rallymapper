# Standalone Travel Mode App — Scoping & Build Plan

**Status:** Scoped 2026-06-21. Phases 0 ✅, 1 ✅, 2 ✅ landed (PR #78);
Netlify project `standalonetravel` + `go.routemapper.net` DNS wired ✅.
Remaining: merge PR, confirm prod build settings, then the deferred
editor-deep-link + Web Share Target. Derived from the
MEMORY.md strategic item "Standalone Travel Mode app extraction" (flagged
2026-05-29), to be revisited after Phase 2 (M6) Travel Mode field testing.

Builds on [drive-mode-architecture.md](drive-mode-architecture.md), which
established Travel Mode (formerly Drive Mode) as a **purely additive,
read-only** consumer of roadbook JSON.

---

## 1. Goal

Pull `/travel` out of the main RouteMapper SPA into its own thin,
installable PWA so in-vehicle / on-trail users can install a lightweight
roadbook reader without downloading the full editor bundle.

Success = a user on a phone or iPad can install "RouteMapper Travel" from
its own URL, load a stage, and follow it offline, with a fraction of the
current ~2.0 MB download.

---

## 2. Current state (audit, 2026-06-21)

- **One Vite SPA**, React 19 + react-router, Netlify (`build → dist`).
  Routes: `/auth`, `/` (editor `RouteMapperLayout`), `/travel`, `/review`.
- **Single ~2.0 MB JS chunk** — no code-splitting. PWA precache cap was
  raised to 4 MiB in `vite.config.js` to fit it.
- **Travel Mode is already well-isolated** in `src/travel/` (~2,300 lines).
  Its imports outside that folder are small and shared:
  - `components/roadbook/RoadbookView` + `RoadbookRow`
  - `icons/*` (manifest + 45 SVGs)
  - `roadbook/geo.js`
  - `export/staticMapRenderer.js` — **pure canvas, no Leaflet**
  - `lib/stageNaming.js`, `assets/fullLogo`
  - JSZip + the docx note-overlay parser
- **Not needed by Travel Mode** (i.e. most of the 2 MB): the editor,
  `leaflet`/`react-leaflet`, `@react-google-maps/api`, `jspdf`, the `docx`
  writer, `html2canvas`, `stripe`, Review Mode.
- **Auth:** `/travel` sits behind `RequireAuth`, but guest mode is allowed,
  so file-load Travel Mode already works with no Supabase login.
- **Gap for standalone use:** the loaded roadbook lives in React state only
  (`useRoadbook.js`); a reload loses it. An installed in-vehicle PWA that is
  reopened mid-trip needs persistence.

### Known cone leak to fix
`components/roadbook/tulipAdapter.js` imports `renderTulipSvg` from the
`../../roadbook` **barrel**, which also re-exports `generateRoadbook`
(engine) and the CSV/JSON exporters. Import straight from
`../../roadbook/tulipRenderer` so the thin build never pulls editor-side
code.

---

## 3. Approach (decided)

**Second Vite build target in the same repo**, producing an installable PWA
at its own subdomain, sharing source via normal relative imports. Deployed
as a **second Netlify site** off the same repo with a different build
command + publish dir.

Rejected: separate repo + shared npm package (more ceremony than this earns
now). Rejected: PWA-only with no distinct URL (doesn't deliver the "thin
install" goal).

### Defaults (confirm before Phase 1)
- **Subdomain / name:** `go.routemapper.net` / "RouteMapper Travel".
- **v1 auth:** file-load + guest only — no Supabase/Stripe in the bundle.
  Cloud saved-stages deferred to Phase 3.
- **Repo layout:** same repo, second build target.

---

## 4. Phased plan

### Phase 0 — Decouple & de-risk (helps the current app too)
1. **Lazy-load `/travel` and `/review`** in the existing app via
   `React.lazy` + `Suspense`. Immediate bundle win; proves the cone is
   severable before forking a build.
2. **Fix the cone leak** (tulipAdapter barrel import, §2).
3. **IndexedDB stage persistence** in `useRoadbook` — cache the last-loaded
   stage so a reopened PWA resumes. Lands in the shared hook, so the in-app
   route benefits too.

### Phase 1 — Standalone build target
4. **Minimal entry:** `travel.html` + `src/travel-main.jsx` rendering
   `<TravelMode>` directly — no `RouteMapperLayout`, and for v1 no
   Supabase/Stripe.
5. **`vite.travel.config.js`** with its own `rollupOptions.input`, own PWA
   manifest (name "RouteMapper Travel", own icons, distinct `start_url`),
   output to `dist-travel`. Keep the OSM-tile runtime cache.
6. **Deploy:** second Netlify site, `vite build --config
   vite.travel.config.js`, publish `dist-travel`, custom domain
   `go.routemapper.net` (CNAME). Ship behind a beta link first.

### Phase 1 — built (2026-06-21)
Files added:
- `apps/travel/index.html` — standalone entry html; Vite `root`. Script
  src is the root-relative `/main.jsx`.
- `apps/travel/main.jsx` — minimal React root: renders `<TravelMode/>` with
  no editor layout / Supabase / Stripe / react-router / Sentry. Lives next
  to index.html so the dev server serves it root-relatively; imports the
  shared tree via `../../src` (served from outside the root via the dev
  server's `fs.allow`). NB: the entry must sit inside the Vite root — a
  relative `../../src/...` in the html `<script src>` breaks `dev` because
  the browser can't resolve above the origin root (build is unaffected).
- `vite.travel.config.js` — `root: apps/travel`, `outDir: dist-travel`,
  standalone PWA manifest ("RouteMapper Travel"), OSM-tile runtime cache,
  `__EDITOR_HOME__` define → editor origin for the SourcePicker back-link.
- npm scripts: `dev:travel` (:5174), `build:travel`, `preview:travel`.
- `__EDITOR_HOME__` added to the main `vite.config.js` define (`"/"`) and to
  eslint globals; `SourcePicker` back-link now uses it.

Build result: **446 kB JS (gzip 139)** vs the editor's 2,060 kB (gzip 620),
104 modules vs 907, precache **994 KB / 16 entries**. Proper root
`index.html` + `manifest.webmanifest` emitted.

### Netlify wiring (done 2026-06-21)
One repo → two Netlify **projects** (Netlify renamed "Sites" → "Projects"
in late 2024; the CLI/API still say "site"). The new project:

- **Project name:** `standalonetravel` → `standalonetravel.netlify.app`.
- **Build command:** `npm run build:travel`  ·  **Publish dir:** `dist-travel`.
- **Custom domain:** `go.routemapper.net`.
- Optional env `EDITOR_HOME` if the editor origin ever differs from the
  default `https://app.routemapper.net/`.

**DNS:** `routemapper.net` is on **Netlify DNS**, so adding the custom
domain auto-created the record below — no manual CNAME needed. The
`NETLIFY` record type is Netlify's managed ALIAS/CNAME equivalent (resolves
internally; also valid at apex):

| Name | TTL | Type | Value |
|---|---|---|---|
| `go.routemapper.net` | 3600 | `NETLIFY` | `standalonetravel.netlify.app` |

HTTPS (Let's Encrypt) provisions automatically once the record resolves.

The repo-root `netlify.toml` keeps driving the editor project unchanged;
the `standalonetravel` project overrides build command + publish dir in its
own UI settings. The project must build from a branch that has the
`build:travel` script (i.e. after this PR merges to `main`, or point its
production branch at the feature branch for early testing).

### Phase 2 — Field-ready
7. **Offline resume** end-to-end (IndexedDB stage + cached tiles + cached
   shell) — verify a cold relaunch with no network still shows the stage.
8. **Hand-off from the editor:** export flow / "Open in Travel" deep-links
   to `go.routemapper.net`. Storage isn't shared across origins, so hand off
   via a **Web Share Target / file handler** (register the PWA to receive
   `.zip`/`.json`), not localStorage.
9. Keep the in-app `/travel` route alive during transition — parallel-run,
   don't cut over.

### Phase 2 — built (2026-06-21)
- **File hand-off (receiving side):** manifest `file_handlers` for
  `.zip`/`.json` (vite.travel.config.js). `apps/travel/StandaloneApp.jsx`
  consumes `window.launchQueue` and passes the launched File to TravelMode
  via a new `initialFile` prop; TravelMode loads it once (ref-guarded) and
  it takes precedence over an IndexedDB-restored stage. Chromium
  desktop/Android; no-op on iOS Safari (falls back to the source picker).
- **Offline / update UX:** `UpdateToast` via `virtual:pwa-register/react`
  shows "Ready to work offline" once the SW precaches, and "new version
  available → Reload" when an updated bundle is waiting.
- **Offline resume (item 7):** already functional from Phase 0's IndexedDB
  persistence + the precached shell + OSM-tile runtime cache. No code beyond
  the toast; needs a real-device offline cold-launch check.
- **Item 9 (parallel-run):** the editor's in-app `/travel` route + the
  `ModePicker` "Travel" tab are left untouched, so nothing is cut over.
- Entry split: `main.jsx` is render-only; components live in
  `StandaloneApp.jsx` (keeps fast-refresh happy).

### Deferred (next, not in this PR)
- **Web Share Target** (`share_target`, POST + files) needs a service
  worker that intercepts the POST — i.e. switching vite-plugin-pwa to
  `injectManifest` with a custom SW. File Handling covers the main
  "open this export" path without that, so it was scoped out here.
- **Editor → Travel deep-link button** ("Open in Travel Mode" pointing at
  the standalone origin) is held until the `go.routemapper.net` site is
  actually deployed — a button to a dead domain is worse than none. Wire it
  (behind a `__TRAVEL_HOME__` define) right after the Netlify step below.

### Phase 3 — Optional
10. **Optional sign-in + cloud saved-stages** in the thin app, lazy-loaded
    so Supabase only enters the bundle when a user logs in.

---

## 5. Risks / watch-items
- Two SW scopes / two PWAs on related domains — keep names + icons distinct.
- Sessions don't cross origins — saved-stages on the subdomain need their own
  login (hence v1 is file-load only).
- Shared-component drift — a change for one app can regress the other; the
  Phase 0 lazy-load surfaces this early.
- Reuse the existing `__COMMIT_SHA__` build stamp in the standalone so an
  iPad's served bundle is identifiable.
