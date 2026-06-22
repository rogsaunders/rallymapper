import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// Function to get HTTPS config
function getHttpsConfig() {
  const keyPath = path.resolve("./localhost-key.pem");
  const certPath = path.resolve("./localhost.pem");

  // Check if certificate files exist
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  }

  // Fallback to basic HTTPS
  console.warn("⚠️  Certificate files not found. Using basic HTTPS.");
  console.warn("   Run: node generate-cert.mjs");
  return true;
}

const pkg = JSON.parse(fs.readFileSync("./package.json", "utf-8"));

// Short commit SHA stamped into the bundle so a non-technical user can verify
// which build they're running (e.g. when a Netlify deploy preview has updated
// but the iPad PWA service worker is still serving the prior bundle).  Netlify
// exposes `COMMIT_REF` in the build environment; fall back to `git rev-parse`
// for local dev, or `"dev"` if neither is available.
function getCommitSha() {
  if (process.env.COMMIT_REF) return process.env.COMMIT_REF.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

// Netlify deploy context: "production", "deploy-preview", "branch-deploy", or
// "dev" when running locally.  Lets the in-app build stamp distinguish which
// kind of build is in front of the user.
const buildContext = process.env.CONTEXT || "dev";

export default defineConfig({
  define: {
    __APP_VERSION__:   JSON.stringify(pkg.version),
    __COMMIT_SHA__:    JSON.stringify(getCommitSha()),
    __BUILD_CONTEXT__: JSON.stringify(buildContext),
    // Where the "← Back to the recording app" link in Travel Mode's
    // SourcePicker points. In the main app this is the editor itself, so
    // a relative "/". The standalone Travel build overrides it with the
    // editor's absolute origin (see vite.travel.config.js).
    __EDITOR_HOME__:   JSON.stringify("/"),
    // Where the editor's "Open Travel app ↗" menu item points — the
    // standalone Travel PWA. In production that's go.routemapper.net; in
    // local dev we keep it on the in-app /travel route (same origin) so
    // there's nothing external to reach. Override with TRAVEL_HOME if the
    // standalone ever moves.
    __TRAVEL_HOME__:   JSON.stringify(
      process.env.TRAVEL_HOME ||
        (buildContext === "dev" ? "/travel" : "https://go.routemapper.net/"),
    ),
  },
  server: {
    https: getHttpsConfig(),
    host: "0.0.0.0",
    port: 5173,
  },

  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: false }, // ✅ disable SW in dev
      includeAssets: ["favicon.svg", "favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "Route Mapper",
        short_name: "RouteMapper",
        description:
          "Record and export routes with GPS, icons, and voice input.",
        theme_color: "#588233",
        background_color: "#111827",
        display: "standalone",
        start_url: "/",
        scope: "/",
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
        // Main bundle has grown to ~2.1 MB after several feature
        // landings (Review Mode, Travel Mode, history multi-select,
        // wake-lock + lifecycle log for issue #72). Workbox defaults
        // to a 2 MiB precache limit and fails the build above it;
        // bumping to 4 MiB gives healthy headroom without changing
        // any runtime behaviour. Reduce when the code-splitting
        // follow-up lands.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin.includes("tile.openstreetmap.org"),
            handler: "CacheFirst",
            options: {
              cacheName: "osm-tiles",
              expiration: {
                maxEntries: 1500,
                maxAgeSeconds: 60 * 60 * 24 * 14, // 14 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
