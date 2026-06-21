// src/travel-main.jsx
//
// Entry point for the STANDALONE Travel Mode PWA (the thin in-vehicle /
// on-trail roadbook reader). Built via vite.travel.config.js into
// dist-travel and deployed to its own subdomain — see
// docs/travel-standalone-app.md (Phase 1).
//
// Deliberately minimal versus src/main.jsx: it renders <TravelMode/>
// directly with NO editor layout, NO Supabase/AuthProvider, NO Stripe,
// NO react-router, and NO Sentry. src/travel/ has zero coupling to any of
// those, so this entry's bundle is a small fraction of the editor's.
//
// v1 access model is file-load + guest only (no login), so there is no
// auth gate here — Travel Mode handles its own source picker.

import React from "react";
import ReactDOM from "react-dom/client";
import TravelMode from "./travel/TravelMode";
import "./index.css";

import { registerSW } from "virtual:pwa-register";
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <TravelMode />
  </React.StrictMode>,
);
