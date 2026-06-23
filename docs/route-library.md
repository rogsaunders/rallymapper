# Route Library — Scoping & Build Plan

**Name:** "Route Library" (decided 2026-06-22).

**Status:** Scoped 2026-06-22. **Phase A started** (foundation: schema +
content policy) — see §11/§15. Captures the MEMORY strategic item "Route
store with 60/40 revenue share" (flagged 2026-05-29) and the 2026-06-22
design discussion. Sibling to
[travel-standalone-app.md](travel-standalone-app.md) and
[waypoint-activation.md](waypoint-activation.md).

---

## 1. Goal

A marketplace where authors publish curated routes and earn from
downloads; others search a metadata catalogue to find, (optionally pay
for) and download routes for import into **Travel Mode** (or any app, via
the standard export formats). RouteMapper takes a **40%** cut; the author
keeps **60%**.

This is the monetisation engine of the suite. Travel Mode is its delivery
vehicle — see §4 and the decision in §12 to keep basic Travel **free**.

---

## 2. Scope

**In (the end state this doc designs toward):**
- Author submission of a RouteMapper export ZIP (or bare `stage.json`).
- Curation/acceptance workflow before a listing goes public.
- Faceted + geospatial search over a metadata schema.
- Free and paid listings; paid via Stripe; 60/40 revenue share.
- One-tap import of a purchased/free route into Travel Mode.

**Out (at least for v1; revisit later):**
- Subscriptions/bundles of routes (single-purchase only first).
- In-app route *editing* of purchased routes (download → open in editor as
  normal).
- Event conducting / checkpoints / results (already out of scope per
  waypoint-activation.md; overlaps here but stays separate).
- Social features beyond ratings/reviews (following authors, comments).

---

## 3. Architecture — reuse what already exists

The hard infrastructure is already in the codebase, which is why this is
tractable:

| Need | Reuse |
|---|---|
| Auth + identity | Supabase auth + `profiles` (`profiles.plan`) |
| Catalogue DB | Supabase Postgres + RLS (mirror the `stage_exports` table pattern in `src/lib/stageSync.js`) |
| File storage | Supabase Storage bucket, **private**, served via signed URLs |
| Payments | Stripe — `netlify/functions/create-checkout.js` already does Bearer-auth + service-role; it already has a one-time `event_pass` type to model single purchases on |
| Webhooks | `netlify/functions/stripe-webhook.js` |
| Author payouts | **Stripe Connect (Express)** — new; application-fee = the 40% |
| Server logic | Netlify Functions (validation, signed-URL issuance, payout split) |
| File validation | Reuse the existing parser/normaliser from `src/travel/hooks/useRoadbook.js` (extracted into a shared, server-runnable module) |
| Preview thumbnails | `src/export/staticMapRenderer.js` (pure canvas — can render a static map at submission) |
| Activity taxonomy | The **Activity + sub-type** vocabulary from waypoint-activation.md |

No new database vendor, no new payments vendor.

---

## 4. Where it lives

**Host the storefront on `go.routemapper.net`** (the standalone Travel
origin), e.g. at `/store`, rather than a third origin.

Rationale: a purchased route then loads **directly into Travel Mode**
because storefront and reader share an origin (same Supabase session, same
IndexedDB, same `useRoadbook` loader) — no cross-origin file juggling. This
is also why it largely **removes the need for Web Share Target** (deferred
in the travel-standalone doc): same-origin "Open in Travel" is just a
client-side handoff.

The editor (`app.routemapper.net`) gets a "Browse the Route Store ↗" link
(mirrors the new `__TRAVEL_HOME__` deep-link pattern).

Implication: the storefront UI needs auth (sign-in for purchases/library),
so it is **not** part of the auth-free thin Travel bundle — it's a separate
lazy-loaded surface on the same origin. The free file-load reader stays
auth-free; the store sits beside it.

---

## 5. Data model (sketch)

Postgres tables (all RLS-guarded). Naming mirrors `stage_exports`.

```
route_listings
  id              uuid pk
  author_id       uuid → profiles.id
  status          text  -- draft|submitted|in_review|published|unpublished|rejected
  title           text
  summary         text
  description     text            -- long, markdown
  activity        text            -- car|rally|4wd|moto|cycle|walk|...
  sub_type        text            -- trail|adventure|road|...
  region          text            -- free-text + country code
  country         text
  -- Phase A stores the bounding box as plain numerics (region filtering is
  -- enough for the free catalogue). PostGIS geography + GiST radius search
  -- is deferred to Phase D — PostGIS is available on the project but NOT
  -- installed, and we don't want the heavy extension prematurely.
  min_lat, min_lon, max_lat, max_lon, center_lat, center_lon  numeric
  stage_count     int             -- complexity inputs (see §pricing) —
  distance_km     numeric         --   auto-derived from stage.json at
  waypoint_count  int             --   submission, drive the sliding scale
  surface         text            -- sealed|gravel|sand|mixed|technical
  difficulty      int             -- 1..5
  elevation_gain_m int
  duration_min    int             -- estimated
  language        text
  tags            text[]
  price_cents     int             -- 0 = free
  currency        text            -- 'aud' default
  license         text            -- usage terms id
  preview_url     text            -- public thumbnail (Storage)
  rating_avg      numeric
  rating_count    int
  download_count  int
  created_at, updated_at, published_at

route_versions            -- a listing can be re-published; buyers get latest
  id, listing_id, version, storage_path (private bucket), file_bytes,
  format_version, stage_json_meta jsonb, created_at

route_purchases
  id, listing_id, version_id, buyer_id, price_cents, currency,
  stripe_payment_intent, status (paid|refunded), created_at
  -- a row here = entitlement to download (signed URL)

route_payouts             -- author earnings ledger (even if manual in v1)
  id, author_id, purchase_id, gross_cents, fee_cents (40%), net_cents,
  stripe_transfer_id (nullable until Connect), status, created_at

route_reviews
  id, listing_id, buyer_id, rating int, body text, created_at
```

Files (the export ZIP) live in a **private** Storage bucket; download is
only ever via a short-lived signed URL minted by a function after checking
`route_purchases` (or `price_cents = 0`). The public `preview_url`
thumbnail is the only world-readable asset.

---

## 6. Search & metadata

- **Facets:** activity + sub-type, region/country, difficulty, distance
  bands, surface, price (free/paid), language, rating.
- **Full-text:** Postgres generated `tsvector` (title/summary/description/
  region) + `pg_trgm` for fuzzy title match (both available on the project).
- **Geospatial:** Phase A filters by `region`/`country` + bbox numerics;
  true "routes near me" radius search lands in Phase D via PostGIS. A
  differentiator, but not needed to launch.
- Metadata is **auto-extracted at submission** from `Source/stage.json`
  (distance, bbox from track points, row/waypoint counts) and the author
  fills the rest (title, description, price, activity).

---

## 7. Submission & curation workflow

```
draft → submitted → in_review → published
                              ↘ rejected (with reason)
published → unpublished (author or admin)
```

1. Author uploads ZIP/JSON in the store UI.
2. **Automated validation** (Netlify Function): reuse the `useRoadbook`
   parser to confirm a valid roadbook, strip archive noise, check size,
   reject malformed/empty stages. Auto-generate the preview thumbnail via
   `staticMapRenderer`. Auto-fill derived metadata.
3. Author completes listing fields, sets price, accepts the author terms,
   submits.
4. **Manual review by Roger** initially (quality, safety, no obviously
   private-land/illegal routes). Later: trusted-author auto-publish.
5. On accept → `published`, appears in search.

---

## 8. Payments & 60/40 split

- **Paid checkout:** extend the existing Stripe Checkout function with a
  `route_purchase` type (price = listing price, one-off — model on the
  existing `event_pass` one-time path). On `checkout.session.completed`
  (webhook), insert `route_purchases` (→ entitlement) and a `route_payouts`
  ledger row computing `fee = 40%`, `net = 60%`.
- **Author payouts — phased:**
  - **v1 (Phase B):** RouteMapper is merchant of record; the ledger records
    what each author is owed; Roger pays out **manually/periodically**. No
    Connect yet — fastest path to "people can pay".
  - **later (Phase D):** **Stripe Connect Express** — authors onboard a
    connected account; use a destination charge with
    `application_fee_amount` = 40% so the 60% lands in the author's account
    automatically and payouts are Stripe-managed.
- **Tax:** enable **Stripe Tax**; digital goods VAT/GST handling.
- **Refunds:** digital-goods policy — default no refunds once downloaded,
  except faulty/misrepresented routes (manual refund → mark
  `route_purchases.status = refunded`, reverse the payout row).

---

## 9. Delivery & licensing (realism)

- Download = short-lived **signed URL** from the private bucket, minted
  only after entitlement check.
- You **cannot DRM a zip** — a buyer can re-share it. Don't over-invest.
  Mitigate pragmatically:
  - Stamp the buyer/license id into the downloaded package metadata
    (a `LICENSE.txt` / field in `stage.json`) — a soft deterrent + traceable.
  - Clear **terms of use** (personal use, no resale/redistribution).
  - Accept that casual copying happens, as in every digital marketplace.

---

## 10. Import into Travel

- Same-origin (store + Travel on `go.routemapper.net`): after purchase,
  "Open in Travel" downloads the ZIP client-side and feeds it to the
  existing `useRoadbook.loadFile` — and into IndexedDB via the Phase-0
  `stageCache`, so it persists offline.
- A logged-in user also gets a **Library** ("My routes") of purchased/free
  listings, re-openable any time → this is effectively the deferred Phase 3
  "cloud saved-stages" feature, delivered through the store.

---

## 11. Phasing (de-risked)

- **Phase A — Free catalogue.** Schema + Storage + search + free download +
  one-tap import. Seed it with Roger's own routes. No payments. Proves the
  catalogue, search, and import path, and bootstraps content (solves cold
  start).
- **Phase B — Paid downloads.** Stripe Checkout, RouteMapper as merchant of
  record, `route_purchases` entitlements + signed-URL delivery, manual
  author payouts from the ledger. Proves willingness to pay.
- **Phase C — Author self-submission + curation queue.** Submission UI,
  automated validation + preview generation, review/accept/reject, author
  terms. Opens supply beyond Roger.
- **Phase D — Stripe Connect 60/40 + reviews + geo search polish.**
  Automated payouts, ratings/reviews, PostGIS "near me", trusted-author
  auto-publish.

Each phase is independently shippable and useful.

---

## 12. Decisions made (2026-06-22)

- **Name: "Route Library".**
- **Launch free-only** to build trust (Phase A). Pricing switches on in
  Phase B.
- **Pricing = sliding scale by complexity.** Not stage-count alone (a weak
  proxy): a **composite score** from `stage_count` + `distance_km` +
  `waypoint_count`, bucketed into 3–4 tiers. Phase A captures those metrics
  at submission so the scale can be turned on cleanly later.
- **Author eligibility:** must be a **current subscriber AND a trusted
  author** (a `route_authors` row with `status='active'`, mirroring the
  `beta_users` gating pattern). Trust accrues over time. **Buying/
  downloading stays open** (free routes openable even by guests) — never
  gate consumption, or the market won't grow.
- **Content policy + safety disclaimer + author warranty are REQUIRED
  before any money changes hands** (before Phase B). First draft:
  [route-library-content-policy.md](route-library-content-policy.md).
- **Basic Travel stays FREE** — it is the Library's delivery surface and the
  adoption hook; paywalling it double-charges buyers and forces auth back
  into the thin app. Monetise premium *Travel features* under the existing
  Solo/Pro plans + Library sales — do **not** hard-paywall Travel.
- **Storefront lives on `go.routemapper.net`** (same origin as Travel).
- **Payments reuse Stripe**; payouts start manual (ledger), move to Connect
  in Phase D.

## 13. Risks / watch-items

- **Liability & safety** — off-road/rally routes carry real risk
  (trespass, terrain). Need a content policy (no private-land/illegal
  routes), a prominent safety/navigation disclaimer, and an author
  warranty (they own/are licensed for the route + right to sell). Worth a
  short legal review before Phase B.
- **Cold start** — seed with Roger's catalogue (Phase A) before opening
  submissions.
- **Curation burden** — manual review doesn't scale; design the
  trusted-author path early even if enabled later.
- **Merchant-of-record / tax** — Stripe Tax + clear invoicing;
  international VAT/GST.
- **Quality bar** — bad routes erode trust fast; ratings + easy
  unpublish/refund are the pressure valve.

## 14. Open questions — resolved 2026-06-22

All five answered (see §12). Remaining for Phase B (not blocking Phase A):

1. The exact complexity → price-tier breakpoints (define the buckets once we
   have a few real stages to calibrate against).
2. Whether the composite score weights distance vs waypoints differently per
   activity (a 300 km road route vs a 30 km technical trail).
3. Connect onboarding UX + payout cadence (Phase D).

## 15. Phase A — build steps & status

Phase A = the free catalogue. Foundation-first (schema before UI):

1. **Schema migration** (`route-library-phase-a-migration.sql`) — ✅ applied
   to prod `rfmvyachiypzvtxpdvma` (validated on a dev branch first). Tables:
   `route_authors`, `route_listings`, `route_versions`, `route_downloads`;
   RLS; storage buckets; indexes; `updated_at` triggers. **Phase A note:**
   `route-files` is PUBLIC-read (free catalogue → no signed-URL function);
   Phase B reverts to private + signed URLs + entitlement.
2. **Content policy + disclaimer + author terms** —
   ✅ first draft (`route-library-content-policy.md`).
3. **Read API + storefront surface** on `go.routemapper.net/library` — ✅
   built: `src/library/` (anon read API, browse + search + activity facets,
   listing detail, one-tap "Open in Travel" via same-origin file handoff into
   TravelMode `initialFile`). Lazy-loaded chunk, excluded from the Travel PWA
   precache. Roger granted an `active` `route_authors` row. Verified: anon
   read + full-text paths return 200 against prod; build/lint/dev-transform
   clean. Pending real data (catalogue is empty until seeding/submission).
   `download_count` increment deferred (anon can't update under RLS → needs a
   small RPC/function later).
4. **Submission flow** (author-gated) — ✅ built: approach A (Supabase
   password sign-in on the standalone, `LibraryAuthProvider`, lazy with
   `/library`). `/library/submit` requires sign-in + an `active`
   `route_authors` row. Parser extracted to `src/travel/lib/roadbookParse.js`
   (`parseRouteFile`, shared with Travel via the slimmed `useRoadbook`);
   `deriveMetadata.js` computes stage_count/distance_km/waypoint_count/bbox;
   `submitApi.submitRoute` uploads to `route-files/<uid>/<listingId>/` and
   inserts a `submitted` listing + version. RLS hardened: author inserts are
   restricted to `draft`/`submitted` (can't self-publish). **Publishing is a
   service-role/admin transition** (Roger flips `submitted → published`).
   Preview-thumbnail generation deferred (cards show a placeholder).
5. **Seed** with Roger's own routes to bootstrap content. *(next — submit via
   `/library/submit`, then publish; or seed + publish via SQL.)*

⚠️ Before the storefront ships: set `VITE_SUPABASE_URL` +
`VITE_SUPABASE_ANON_KEY` on the `standalonetravel` Netlify project (must
point at `rfmvyachiypzvtxpdvma`) — the storefront build needs them; the
Netlify MCP couldn't enumerate the project, so this is a manual UI step.
