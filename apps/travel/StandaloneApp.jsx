// apps/travel/StandaloneApp.jsx
//
// Root component for the standalone Travel Mode PWA. Kept separate from
// the main.jsx entry so the entry stays render-only (and HMR fast-refresh
// is happy). See apps/travel/main.jsx and docs/travel-standalone-app.md
// (Phase 2).

import React, { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import TravelMode from "../../src/travel/TravelMode";

// Consume a file launched via the OS file handler (File Handling API).
// Returns the launched File once available, or null. Feature-detected —
// browsers without launchQueue (e.g. iOS Safari today) simply never set a
// file, and the user falls back to the in-app source picker.
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

// Small bottom toast driven by the PWA service-worker lifecycle.
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
  const initialFile = useLaunchFile();
  return (
    <>
      <TravelMode initialFile={initialFile} />
      <UpdateToast />
    </>
  );
}
