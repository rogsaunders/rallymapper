// vite.travel.config.js
//
// Build config for the STANDALONE Travel Mode PWA. Produces a thin,
// installable roadbook reader from the shared src/ tree, deployed to its
// own subdomain (default go.routemapper.net) — see
// docs/travel-standalone-app.md (Phase 1).
//
// Usage:
//   npm run dev:travel     # local dev on :5174
//   npm run build:travel   # → dist-travel/
//
// Multi-app layout: Vite `root` points at apps/travel/, whose index.html
// is the standalone entry. Shared source under src/ is imported with
// relative paths and resolves normally. publicDir + outDir are pinned to
// absolute repo paths so favicons/PWA icons are copied and the output
// lands at the repo-root dist-travel/.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import fs from "fs";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = (...segs) => path.resolve(__dirname, ...segs);

// Same self-signed HTTPS handling as the main config — geolocation and
// speechSynthesis both require a secure context, even in local dev.
function getHttpsConfig() {
  const keyPath = r("localhost-key.pem");
  const certPath = r("localhost.pem");
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  }
  console.warn("⚠️  Certificate files not found. Using basic HTTPS.");
  return true;
}

const pkg = JSON.parse(fs.readFileSync(r("package.json"), "utf-8"));

function getCommitSha() {
  if (process.env.COMMIT_REF) return process.env.COMMIT_REF.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

const buildContext = process.env.CONTEXT || "dev";

// Absolute origin of the main editor app. The standalone Travel build's
// "← Back to the recording app" link (SourcePicker) points here rather
// than at a relative "/", which in this app is Travel Mode itself.
const EDITOR_HOME = process.env.EDITOR_HOME || "https://app.routemapper.net/";

export default defineConfig({
  root: r("apps/travel"),
  // Own minimal public dir (just the PWA icons) rather than the editor's
  // public/, which carries 1 MB+ legacy artwork that would bloat the thin
  // app's precache. See docs/travel-standalone-app.md (Phase 1).
  publicDir: r("apps/travel/public"),

  define: {
    __APP_VERSION__:   JSON.stringify(pkg.version),
    __COMMIT_SHA__:    JSON.stringify(getCommitSha()),
    __BUILD_CONTEXT__: JSON.stringify(buildContext),
    __EDITOR_HOME__:   JSON.stringify(EDITOR_HOME),
  },

  build: {
    outDir: r("dist-travel"),
    emptyOutDir: true,
  },

  server: {
    https: getHttpsConfig(),
    host: "0.0.0.0",
    port: 5174, // distinct from the editor's 5173 so both can run at once
    fs: {
      // apps/travel/main.jsx imports from ../../src (outside the Vite
      // root). Allow the dev server to serve files from the whole repo.
      allow: [r(".")],
    },
  },

  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "RouteMapper Travel",
        short_name: "RM Travel",
        description:
          "Follow a recorded roadbook on the road, trail, or track — GPS auto-advance and voice readout.",
        theme_color: "#588233",
        background_color: "#111827",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        // File Handling API — let the installed app open RouteMapper
        // export ZIPs (and bare stage.json) directly from the OS file
        // browser / "Open with". The launch is handled by the launchQueue
        // consumer in apps/travel/main.jsx, which feeds the file into
        // Travel Mode. Supported on Chromium desktop/Android; a no-op
        // elsewhere (iOS Safari falls back to the in-app source picker).
        file_handlers: [
          {
            action: "/",
            accept: {
              "application/zip": [".zip"],
              "application/json": [".json"],
              "application/gpx+xml": [".gpx"],
            },
          },
        ],
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/pwa-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Keep the installed Travel app thin: don't precache the lazy Route
        // Library chunk (storefront + supabase-js). Browsing the catalogue
        // needs the network regardless, so there's no offline value in
        // shipping its code to every Travel install — it loads on demand.
        globIgnores: ["**/LibraryApp-*.js"],
        runtimeCaching: [
          {
            // ArcGIS Static Basemap Tiles (the licensed source once
            // VITE_ARCGIS_API_KEY is set). CacheFirst = a per-user browser
            // cache of tiles actually viewed, which Esri's terms explicitly
            // permit (and don't even meter). This is NOT bulk pre-fetching.
            urlPattern: ({ url }) =>
              url.origin.includes("static-map-tiles-api.arcgis.com") ||
              url.origin.includes("ibasemaps-api.arcgis.com"),
            handler: "CacheFirst",
            options: {
              cacheName: "arcgis-basemap-tiles",
              expiration: {
                maxEntries: 3000,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // OSM street tiles.
            urlPattern: ({ url }) =>
              url.origin.includes("tile.openstreetmap.org"),
            handler: "CacheFirst",
            options: {
              cacheName: "osm-tiles",
              expiration: {
                maxEntries: 2500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Esri World Imagery (satellite — the default source), and the
            // target of Phase 2b offline corridor pre-caching. Larger cap
            // since a whole stage's corridor is pre-fetched here.
            urlPattern: ({ url }) =>
              url.origin.includes("server.arcgisonline.com"),
            handler: "CacheFirst",
            options: {
              cacheName: "esri-imagery-tiles",
              expiration: {
                maxEntries: 3500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // OpenTopoMap (topographic).
            urlPattern: ({ url }) =>
              url.origin.includes("tile.opentopomap.org"),
            handler: "CacheFirst",
            options: {
              cacheName: "opentopo-tiles",
              expiration: {
                maxEntries: 2500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
