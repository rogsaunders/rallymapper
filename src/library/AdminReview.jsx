// src/library/AdminReview.jsx
//
// Admin review queue for the Route Library (/library/admin). Lists submitted
// routes and lets an admin Publish or Reject them via the admin-listings
// function. Gated to signed-in admins; the server re-checks is_admin.

import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLibraryAuth } from "./lib/libraryAuth";
import { listQueue, publishListing, rejectListing } from "./lib/adminApi";
import { fileUrl } from "./lib/libraryApi";
import LibraryHeader from "./components/LibraryHeader";

function fmtKm(v) {
  return Number.isFinite(Number(v)) ? `${Math.round(Number(v))} km` : "—";
}

export default function AdminReview() {
  const { user, loading: authLoading, isAdmin } = useLibraryAuth();
  const [queue, setQueue] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setQueue(null);
    try {
      setQueue(await listQueue());
    } catch (e) {
      setError(e?.message || String(e));
      setQueue([]);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  async function act(fn, id, ...args) {
    setBusyId(id);
    setError(null);
    try {
      await fn(id, ...args);
      setQueue((q) => (q ? q.filter((l) => l.id !== id) : q));
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusyId(null);
    }
  }

  const onReject = (id) => {
    const reason = window.prompt("Reason for rejection (optional):") ?? "";
    act(rejectListing, id, reason);
  };

  let body;
  if (authLoading) {
    body = <p className="text-gray-500 text-sm">Loading…</p>;
  } else if (!user) {
    body = (
      <p className="text-gray-600 text-sm">
        Please <Link to="/library/submit" className="text-[#588233] underline">sign in</Link>{" "}
        as an admin.
      </p>
    );
  } else if (!isAdmin) {
    body = <p className="text-gray-600 text-sm">You don’t have admin access.</p>;
  } else if (queue === null && !error) {
    body = <p className="text-gray-500 text-sm">Loading queue…</p>;
  } else if (queue && queue.length === 0) {
    body = <p className="text-gray-600 text-sm">Nothing awaiting review. 🎉</p>;
  } else if (queue) {
    body = (
      <ul className="space-y-3">
        {queue.map((l) => {
          const v = (l.route_versions || [])[0];
          return (
            <li key={l.id} className="bg-white rounded-2xl border shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900">{l.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {[l.activity, l.region, l.country].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {fmtKm(l.distance_km)} · {l.stage_count} stage(s) ·{" "}
                    {l.waypoint_count ?? "—"} wpts
                    {v?.storage_path && (
                      <>
                        {" · "}
                        <a
                          href={fileUrl(v.storage_path)}
                          download
                          className="text-[#588233] underline"
                        >
                          file
                        </a>
                      </>
                    )}
                  </p>
                  {l.summary && (
                    <p className="text-sm text-gray-600 mt-1">{l.summary}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyId === l.id}
                    onClick={() => act(publishListing, l.id)}
                    className="px-3 py-1.5 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
                    style={{ backgroundColor: "#588233" }}
                  >
                    {busyId === l.id ? "…" : "Publish"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === l.id}
                    onClick={() => onReject(l.id)}
                    className="px-3 py-1.5 rounded-lg border text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <LibraryHeader />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Review queue</h1>
          {isAdmin && (
            <button
              type="button"
              onClick={load}
              className="text-sm text-[#588233] hover:underline"
            >
              Refresh
            </button>
          )}
        </div>
        {error && (
          <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </div>
        )}
        <div className="mt-5">{body}</div>
      </div>
    </div>
  );
}
