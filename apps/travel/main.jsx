// apps/travel/main.jsx
//
// Entry point for the STANDALONE Travel Mode PWA (the thin in-vehicle /
// on-trail roadbook reader). Built via vite.travel.config.js into
// dist-travel and deployed to its own subdomain — see
// docs/travel-standalone-app.md (Phases 1–2).
//
// Lives next to index.html (the Vite root) so the dev server can serve it
// root-relatively as /main.jsx. Render-only — the app itself lives in
// StandaloneApp.jsx, which pulls TravelMode from the shared src/ tree.
//
// Deliberately minimal versus src/main.jsx: NO editor layout, NO
// Supabase/AuthProvider, NO Stripe, NO react-router, NO Sentry. src/travel/
// has zero coupling to any of those, so this bundle is a small fraction of
// the editor's.

import React from "react";
import ReactDOM from "react-dom/client";
import StandaloneApp from "./StandaloneApp";
import "../../src/index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <StandaloneApp />
  </React.StrictMode>,
);
