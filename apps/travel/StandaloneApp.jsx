// apps/travel/StandaloneApp.jsx
//
// Root component for the standalone PWA on go.routemapper.net. Two surfaces
// share this origin (and SPA):
//   • "/"          → Travel Mode (the thin in-vehicle reader)
//   • "/library/*" → the Route Library storefront (lazy-loaded, so Travel-only
//                    users never download it or supabase-js)
//
// See apps/travel/main.jsx and docs/travel-standalone-app.md / route-library.md.

import React, { Suspense, lazy, useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import TravelMode from "../../src/travel/TravelMode";
import { takePendingRoute } from "../../src/library/lib/handoff";

const LibraryApp = lazy(() => import("../../src/library/LibraryApp"));

// Consume a file launched via the OS file handler (File Handling API).
function useLaunchFile() {
  const [file, setFile] = useState(null);
  useEffect(() => {
    if (!("launchQueue" in window) || !window.launchQueue) return;
    window.launchQueue.setConsumer(async (params) => {
      const handle = params?.files?.[0];
      if (!handle) return;
      try {
        setFile(await handle.getFile());
      } catch (e) {
        console.warn("launchQueue: failed to read launched file", e);
      }
    });
  }, []);
  return file;
}

// Travel Mode home. Its initial file comes from either an OS file-handler
// launch or a "Open in Travel" handoff from the Route Library. Travel exposes
// a /library link on its source picker via the libraryHref prop.
function TravelHome() {
  const launched = useLaunchFile();
  // Read-and-clear the library handoff once, on mount.
  const [handoff] = useState(() => takePendingRoute());
  return <TravelMode initialFile={launched || handoff} libraryHref="/library" />;
}

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 text-gray-500 text-sm">
      Loading…
    </div>
  );
}

function UpdateToast() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });

  if (!offlineReady && !needRefresh) return null;

  const dismiss = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-xl bg-gray-900 text-white shadow-lg px-4 py-3 flex items-center gap-3"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <span className="text-sm flex-1">
        {needRefresh
          ? "A new version of Travel Mode is available."
          : "Ready to work offline."}
      </span>
      {needRefresh && (
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className="text-sm font-semibold rounded-lg px-3 py-1.5"
          style={{ backgroundColor: "#588233" }}
        >
          Reload
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        className="text-sm text-gray-300 hover:text-white px-1"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

export default function StandaloneApp() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<TravelHome />} />
          <Route path="/library/*" element={<LibraryApp />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <UpdateToast />
    </BrowserRouter>
  );
}
