# Standalone Travel Mode App — Scoping & Build Plan

**Status:** Scoped 2026-06-21. Phase 0 ✅ and Phase 1 ✅ landed; ready for
Netlify wiring + beta deploy. Derived from the
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

### Netlify wiring (to do — needs Roger)
One repo → two Netlify sites. For the new site:
1. New Site → import the same Git repo.
2. Build command: `npm run build:travel`  ·  Publish dir: `dist-travel`.
3. Domain management → add `go.routemapper.net` → create the CNAME at the
   DNS host.
4. Optionally set env `EDITOR_HOME` if the editor origin differs from the
   default `https://app.routemapper.net/`.
The existing `netlify.toml` keeps driving the editor site unchanged; the
new site overrides build command + publish dir in its own UI settings.

### Phase 2 — Field-ready
7. **Offline resume** end-to-end (IndexedDB stage + cached tiles + cached
   shell) — verify a cold relaunch with no network still shows the stage.
8. **Hand-off from the editor:** export flow / "Open in Travel" deep-links
   to `go.routemapper.net`. Storage isn't shared across origins, so hand off
   via a **Web Share Target / file handler** (register the PWA to receive
   `.zip`/`.json`), not localStorage.
9. Keep the in-app `/travel` route alive during transition — parallel-run,
   don't cut over.

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
