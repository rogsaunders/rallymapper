// src/export/staticMapRenderer.js
//
// Render a Leaflet-style web map to an HTMLCanvasElement entirely from scratch,
// without screenshotting the live DOM.  The capture path used to depend on
// html2canvas / dom-to-image-more to rasterise the live Leaflet container,
// which on iPad Safari produced offsets, broken polylines and z-order issues
// (PR #27 history has the receipts).  This renderer replaces all of that:
//
//   1. Pick the highest integer zoom where the supplied bounds fit in
//      (width − 2·padding) × (height − 2·padding) — same algorithm Leaflet's
//      fitBounds uses.
//   2. Compute the canvas's world-pixel origin so the bounds are centred.
//   3. Fetch every tile whose extent intersects the canvas, in parallel, via
//      <img crossOrigin="anonymous">.  Missing tiles fall through to the
//      white background — no all-or-nothing failure.
//   4. drawImage every loaded tile at `tileWorldXY − originXY`.
//   5. Project track points via the same world-pixel math and stroke the
//      polyline (white casing + red core).
//   6. Draw waypoint badges as canvas primitives (rounded-rect background +
//      text).  Pure canvas — no DOM, no html2canvas, no SVG.
//
// Every layer goes through the same Web-Mercator projection, so the polyline
// and markers are pixel-aligned with the tiles by construction.  That's the
// property the old screenshot-based pipeline could never guarantee.
//
// The function is a pure async helper that returns an HTMLCanvasElement —
// the caller (exportMapPdf.js) decides what to do with it (jsPDF embed,
// download as PNG, etc.).

const TILE_SIZE = 256;

// ── Tile sources ─────────────────────────────────────────────────────────────
//
// Mirrors the live map's `mapSource` options.  Each entry: a URL template
// (with `{z}/{x}/{y}` and optional `{s}` subdomain placeholders), the max
// integer zoom the source supports, and the attribution string we'll print in
// the PDF footer.

// When an ArcGIS Location Platform API key is configured (VITE_ARCGIS_API_KEY —
// set in the Travel/go.routemapper.net Netlify env), all three styles are
// served from Esri's Static Basemap Tiles service. Its free tier carries a
// COMMERCIAL deployment licence, unlike the raw OSM/Esri/OpenTopo endpoints
// whose usage policies forbid commercial/bulk use — so this is the compliant
// source for the paid product. The key is referrer-locked (go.routemapper.net
// + *.netlify.app) so shipping it in the client bundle is safe. Style ids and
// the 512px {z}/{y}/{x} format were verified live against the service.
//
// Fallback (no key — e.g. the editor's PDF export build): the original
// token-free endpoints, unchanged, so nothing that lacks the key breaks.
const ARCGIS_KEY = import.meta.env.VITE_ARCGIS_API_KEY;
const ARCGIS_TILES =
  "https://static-map-tiles-api.arcgis.com/arcgis/rest/services/static-basemap-tiles-service/v1";
const arcgisTemplate = (style) =>
  `${ARCGIS_TILES}/${style}/static/tile/{z}/{y}/{x}?token=${ARCGIS_KEY}`;

export const TILE_SOURCES = ARCGIS_KEY
  ? {
      osm: {
        template: arcgisTemplate("arcgis/navigation"),
        maxZoom: 19,
        tileSize: 512,
        attribution: "Powered by Esri — HERE, Garmin, © OpenStreetMap contributors",
      },
      esri_imagery: {
        template: arcgisTemplate("arcgis/imagery/labels"),
        maxZoom: 19,
        tileSize: 512,
        attribution: "Powered by Esri — Maxar, Earthstar Geographics",
      },
      opentopo: {
        template: arcgisTemplate("arcgis/outdoor"),
        maxZoom: 19,
        tileSize: 512,
        attribution: "Powered by Esri — © OpenStreetMap contributors",
      },
    }
  : {
      osm: {
        template: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      },
      esri_imagery: {
        template:
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        maxZoom: 19,
        attribution: "Tiles © Esri",
      },
      opentopo: {
        template: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        maxZoom: 17,
        subdomains: ["a", "b", "c"],
        attribution: "© OpenTopoMap (CC-BY-SA)",
      },
    };

export function tileSourceAttribution(source) {
  return (TILE_SOURCES[source] || TILE_SOURCES.osm).attribution;
}

// ── Slippy-map / Web-Mercator math ───────────────────────────────────────────

/**
 * Project (lon, lat) to absolute world pixel coordinates at the given integer
 * zoom level.  Origin (0, 0) is the top-left of tile (0, 0) at this zoom.
 */
function lonLatToWorldPixel(lon, lat, zoom) {
  const n = Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * n * TILE_SIZE;
  const latRad = (lat * Math.PI) / 180;
  const y =
    ((1 -
      Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
      2) *
    n *
    TILE_SIZE;
  return { x, y };
}

/**
 * Highest integer zoom where the bounds, with padding subtracted from the
 * canvas extents, fit entirely on screen.
 *
 * `bounds` is `[[south, west], [north, east]]`.  Returns an integer 0..maxZoom.
 */
function chooseZoom(bounds, width, height, padding, maxZoom) {
  const [[south, west], [north, east]] = bounds;
  const innerW = Math.max(1, width - 2 * padding);
  const innerH = Math.max(1, height - 2 * padding);

  for (let z = maxZoom; z >= 0; z--) {
    const sw = lonLatToWorldPixel(west, south, z);
    const ne = lonLatToWorldPixel(east, north, z);
    const dx = Math.abs(ne.x - sw.x);
    // Latitude is inverted in world-pixel space (south has the larger y)
    const dy = Math.abs(sw.y - ne.y);
    if (dx <= innerW && dy <= innerH) return z;
  }
  return 0;
}

function boundsCenter(bounds) {
  const [[south, west], [north, east]] = bounds;
  return { lat: (south + north) / 2, lon: (west + east) / 2 };
}

// ── Tile fetching ────────────────────────────────────────────────────────────

function buildTileUrl(source, z, x, y) {
  const cfg = TILE_SOURCES[source] || TILE_SOURCES.osm;
  let url = cfg.template
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
  if (cfg.subdomains && cfg.subdomains.length) {
    const idx = Math.abs(x + y) % cfg.subdomains.length;
    url = url.replace("{s}", cfg.subdomains[idx]);
  }
  return url;
}

/**
 * Load one tile as an HTMLImageElement.  Resolves with `{x, y, img}` on
 * success or `{x, y, img: null}` on any failure — never rejects, so a single
 * dead tile can't bring down the whole render.
 *
 * `crossOrigin="anonymous"` is required so the resulting canvas isn't
 * tainted (which would block `toDataURL()` / `addImage` downstream).  OSM,
 * Esri and OpenTopo all serve tiles with permissive CORS headers.
 */
function loadTile(source, z, x, y) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const finish = (ok) => resolve({ x, y, img: ok ? img : null });
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = buildTileUrl(source, z, x, y);
  });
}

// ── Waypoint badge rendering ─────────────────────────────────────────────────
//
// The badges visually match the live map's `makeWaypointDivIcon` (MapView.jsx)
// but are drawn with canvas primitives (rounded rect + text) so they survive
// the pure-canvas pipeline.  Keep these two in sync if either changes.

const ICON_ABBR = {
  // Nav
  left: "L", right: "R", keep_l: "KL", keep_r: "KR",
  straight: "S", gate: "GT", cattle_gate: "CG",
  railroad: "RR", give_way: "GW", caution: "CA",
  // Hazard
  danger_1: "H1", danger_2: "H2", danger_3: "H3",
  // Terrain
  bump: "B", bumps: "BB", dip: "D", twisty: "TW",
  ruts: "RT", washout: "WO", up_hill: "UP", down_hill: "DN",
  // Control
  start: "ST", finish: "FN", stop: "SP", checkpoint: "CP",
  time: "TC", fuel: "F", service: "SV",
};

const TYPE_COLOR = {
  nav:     "#1d4ed8", // blue
  hazard:  "#dc2626", // red
  control: "#7c3aed", // purple
  terrain: "#b45309", // amber/brown
  note:    "#374151", // grey
};

function getIconAbbr(type, iconId) {
  const id = (iconId || "").toLowerCase();
  if (id && ICON_ABBR[id]) return ICON_ABBR[id];
  const t = (type || "note").toLowerCase();
  return (
    { nav: "N", hazard: "H", control: "C", terrain: "T", note: "N" }[t] ?? "N"
  );
}

function getTypeColor(type) {
  return TYPE_COLOR[(type || "note").toLowerCase()] ?? TYPE_COLOR.note;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y,     x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x,     y + h, rr);
  ctx.arcTo(x,     y + h, x,     y,     rr);
  ctx.arcTo(x,     y,     x + w, y,     rr);
  ctx.closePath();
}

function drawStartMarker(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = "#2563EB";
  ctx.strokeStyle = "white";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawWaypointBadge(ctx, x, y, wp) {
  const isStart = wp.kind === "start" || wp.poi === "START";
  if (isStart) {
    drawStartMarker(ctx, x, y);
    return;
  }

  const type = String(wp.type || "note").toLowerCase();
  const iconId = String(wp.iconId || "").toLowerCase();
  const abbr = getIconAbbr(type, iconId);
  const bg = getTypeColor(type);
  const number = wp.number; // assigned by caller (1-based, non-start only)

  const ABBR_FONT  = "800 11px sans-serif";
  const NUM_FONT   = "700 9.5px sans-serif";
  const ABBR_PAD_X = 5;
  const ABBR_PAD_Y = 2;
  const ABBR_HEIGHT = 16;
  const NUM_PAD_X  = 3;
  const NUM_HEIGHT = 13;
  const GAP        = 2;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Abbreviation badge
  ctx.font = ABBR_FONT;
  const abbrTextW = ctx.measureText(abbr).width;
  const abbrW = Math.max(20, Math.ceil(abbrTextW) + ABBR_PAD_X * 2);
  const abbrH = ABBR_HEIGHT + ABBR_PAD_Y * 2;

  // Number badge (only for non-start)
  ctx.font = NUM_FONT;
  const numStr = number != null ? String(number) : "";
  const numTextW = numStr ? ctx.measureText(numStr).width : 0;
  const numW = numStr ? Math.max(14, Math.ceil(numTextW) + NUM_PAD_X * 2) : 0;
  const numH = numStr ? NUM_HEIGHT : 0;

  const totalH = abbrH + (numStr ? GAP + numH : 0);
  const topY = y - totalH / 2;

  // ── Abbreviation row ───────────────────────────────────────────────────
  const abbrX = x - abbrW / 2;
  const abbrY = topY;
  roundRectPath(ctx, abbrX, abbrY, abbrW, abbrH, 4);
  ctx.fillStyle = bg;
  ctx.fill();
  // Subtle drop shadow for legibility against busy tiles
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  // White hairline border
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Abbreviation text
  ctx.fillStyle = "#fff";
  ctx.font = ABBR_FONT;
  ctx.fillText(abbr, x, abbrY + abbrH / 2 + 0.5);

  // ── Number row ────────────────────────────────────────────────────────
  if (numStr) {
    const numX = x - numW / 2;
    const numY = abbrY + abbrH + GAP;
    roundRectPath(ctx, numX, numY, numW, numH, 3);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#374151";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#111";
    ctx.font = NUM_FONT;
    ctx.fillText(numStr, x, numY + numH / 2 + 0.5);
  }

  ctx.restore();
}

// ── Bounds + waypoint number helpers (exported for callers) ──────────────────

/**
 * Bounding box `[[s, w], [n, e]]` of all finite (lat, lon) points supplied,
 * or `null` if there's nothing to bound.  Pass the start GPS, every track
 * point, and every waypoint — the caller doesn't have to filter `null`s.
 */
export function computeBounds(points) {
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  let any = false;
  for (const p of points || []) {
    if (!p) continue;
    const lat = Array.isArray(p) ? p[0] : Number(p.lat);
    const lon = Array.isArray(p) ? p[1] : Number(p.lon ?? p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
    if (lon < w) w = lon;
    if (lon > e) e = lon;
    any = true;
  }
  return any ? [[s, w], [n, e]] : null;
}

/**
 * Return a new array where each non-start waypoint has been assigned a
 * 1-based `number` matching the sequence shown on the live map (WP 1, WP 2…).
 * Start waypoints pass through unchanged.
 */
export function numberWaypoints(waypoints) {
  let n = 0;
  return (waypoints || []).map((wp) => {
    const isStart = wp?.kind === "start" || wp?.poi === "START";
    if (isStart) return wp;
    n += 1;
    return { ...wp, number: n };
  });
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Render a map of the supplied route + waypoints to a fresh HTMLCanvasElement.
 *
 * Inputs:
 *   - `routePositions`: array of [lat, lon] pairs (or {lat,lon} objects)
 *     drawn as a single polyline.  Typically `[startGPS, ...trackPoints]` —
 *     do NOT include waypoints here, they're drawn separately as markers.
 *   - `waypoints`: array of waypoint objects (`{lat, lon, type, iconId, kind,
 *     poi, number?}`).  If `number` isn't pre-assigned, callers should run
 *     `numberWaypoints()` first.
 *   - `bounds`: `[[s,w],[n,e]]` — the rectangle the renderer will fit.  Use
 *     `computeBounds([startGPS, ...trackPoints, ...waypoints])` to derive.
 *   - `tileSource`: "osm" | "esri_imagery" | "opentopo".
 *   - `width`, `height`: output canvas dimensions in pixels.
 *   - `padding`: pixels of empty margin to leave around the fitted bounds.
 *   - `polylineStyle`: `{ casingColor, casingWidth, color, width }` override.
 */
export async function renderMapToCanvas({
  routePositions = [],
  waypoints = [],
  bounds,
  tileSource = "osm",
  width = 1600,
  height = 1000,
  padding = 40,
  polylineStyle,
} = {}) {
  if (!bounds) {
    throw new Error(
      "renderMapToCanvas: bounds is required (use computeBounds(...))",
    );
  }

  const cfg = TILE_SOURCES[tileSource] || TILE_SOURCES.osm;
  const maxZoom = cfg.maxZoom ?? 19;
  const zoom = Math.min(maxZoom, chooseZoom(bounds, width, height, padding, maxZoom));

  // Centre the bounds on the canvas, then derive the canvas's world-pixel
  // origin (top-left).  Rounding keeps tile alignment crisp.
  const center = boundsCenter(bounds);
  const centerWorld = lonLatToWorldPixel(center.lon, center.lat, zoom);
  const originX = Math.round(centerWorld.x - width / 2);
  const originY = Math.round(centerWorld.y - height / 2);

  // Tile range that intersects the canvas.
  const n = Math.pow(2, zoom);
  const minTileX = Math.max(0,     Math.floor(originX / TILE_SIZE));
  const minTileY = Math.max(0,     Math.floor(originY / TILE_SIZE));
  const maxTileX = Math.min(n - 1, Math.floor((originX + width  - 1) / TILE_SIZE));
  const maxTileY = Math.min(n - 1, Math.floor((originY + height - 1) / TILE_SIZE));

  const tilePromises = [];
  for (let tx = minTileX; tx <= maxTileX; tx++) {
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      tilePromises.push(loadTile(tileSource, zoom, tx, ty));
    }
  }
  const tiles = await Promise.all(tilePromises);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // White background — visible where tiles failed to load.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);

  for (const tile of tiles) {
    if (!tile.img) continue;
    const tx = tile.x * TILE_SIZE - originX;
    const ty = tile.y * TILE_SIZE - originY;
    // Draw into the logical TILE_SIZE slot: source tiles may be 512px (ArcGIS
    // static basemap tiles) or 256px (fallback) — both fill the same grid cell.
    ctx.drawImage(tile.img, tx, ty, TILE_SIZE, TILE_SIZE);
  }

  // Lat/lon → canvas pixel.  Same projection used for both polyline and
  // markers, so they stay aligned with the tiles by construction.
  const project = (lat, lon) => {
    const wp = lonLatToWorldPixel(lon, lat, zoom);
    return { x: wp.x - originX, y: wp.y - originY };
  };

  // ── Polyline ─────────────────────────────────────────────────────────
  const style = {
    casingColor: "rgba(255,255,255,0.85)",
    casingWidth: 8,
    color:       "#ef4444",
    width:       4,
    ...(polylineStyle || {}),
  };

  if (Array.isArray(routePositions) && routePositions.length >= 2) {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap  = "round";

    ctx.beginPath();
    let started = false;
    for (const pt of routePositions) {
      const lat = Array.isArray(pt) ? pt[0] : Number(pt.lat);
      const lon = Array.isArray(pt) ? pt[1] : Number(pt.lon ?? pt.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const p = project(lat, lon);
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    if (started) {
      ctx.strokeStyle = style.casingColor;
      ctx.lineWidth   = style.casingWidth;
      ctx.stroke();

      ctx.strokeStyle = style.color;
      ctx.lineWidth   = style.width;
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Waypoint badges ─────────────────────────────────────────────────
  for (const wp of waypoints || []) {
    const lat = Number(wp?.lat);
    const lon = Number(wp?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const p = project(lat, lon);
    drawWaypointBadge(ctx, p.x, p.y, wp);
  }

  return canvas;
}
