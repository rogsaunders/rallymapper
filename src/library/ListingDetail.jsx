// src/library/ListingDetail.jsx
//
// Route Library listing detail + "Open in Travel" handoff (Phase A).

import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  getListing,
  latestVersion,
  previewUrl,
  fileUrl,
} from "./lib/libraryApi";
import { setPendingRoute } from "./lib/handoff";
import { useLibraryAuth } from "./lib/libraryAuth";
import { unpublishListing } from "./lib/adminApi";
import LibraryHeader from "./components/LibraryHeader";

function meta(label, value) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-800">{value}</dd>
    </div>
  );
}

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useLibraryAuth();
  const [listing, setListing] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const row = await getListing(id);
        if (!cancelled) {
          if (!row) setError("This route isn’t available.");
          setListing(row || false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || String(e));
          setListing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const version = listing ? latestVersion(listing) : null;

  // Download the route file and hand it to Travel Mode (same-origin handoff).
  async function openInTravel() {
    if (!version) return;
    setBusy(true);
    setError(null);
    try {
      const url = fileUrl(version.storage_path);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const name = version.storage_path.split("/").pop() || "route.zip";
      const file = new File([blob], name, {
        type: blob.type || "application/zip",
      });
      setPendingRoute(file);
      navigate("/");
    } catch (e) {
      setError(e?.message || String(e));
      setBusy(false);
    }
  }

  // Admin-only: pull a published route from the catalogue.
  async function onUnpublish() {
    if (!window.confirm("Unpublish this route? It will be removed from the catalogue.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await unpublishListing(id);
      navigate("/library");
    } catch (e) {
      setError(e?.message || String(e));
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <LibraryHeader />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link to="/library" className="text-sm text-[#588233] hover:underline">
          ← Back to library
        </Link>

        {listing === null && !error && (
          <div className="py-16 text-center text-gray-500 text-sm">Loading…</div>
        )}

        {error && (
          <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </div>
        )}

        {listing && (
          <>
            {previewUrl(listing.preview_path) && (
              <img
                src={previewUrl(listing.preview_path)}
                alt=""
                className="mt-4 w-full rounded-2xl border object-cover"
              />
            )}
            <h1 className="mt-4 text-2xl font-bold text-gray-900">
              {listing.title}
            </h1>
            {listing.summary && (
              <p className="mt-1 text-gray-600">{listing.summary}</p>
            )}

            <button
              type="button"
              disabled={!version || busy}
              onClick={openInTravel}
              className="mt-5 w-full sm:w-auto px-5 py-3 rounded-xl text-white font-semibold disabled:opacity-50"
              style={{ backgroundColor: "#588233" }}
            >
              {busy ? "Opening…" : "🧭 Open in Travel"}
            </button>
            {version && (
              <a
                href={fileUrl(version.storage_path)}
                download
                className="mt-3 sm:mt-0 sm:ml-3 inline-block text-sm text-gray-600 hover:underline"
              >
                Download ZIP
              </a>
            )}
            {isAdmin && (
              <button
                type="button"
                disabled={busy}
                onClick={onUnpublish}
                className="mt-3 sm:mt-0 sm:ml-3 inline-block text-sm text-red-600 hover:underline disabled:opacity-50"
              >
                Unpublish
              </button>
            )}
            {!version && (
              <p className="mt-3 text-sm text-amber-700">
                No downloadable file is attached to this route yet.
              </p>
            )}

            <dl className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
              {meta("Activity", listing.activity)}
              {meta("Type", listing.sub_type)}
              {meta("Region", listing.region)}
              {meta("Country", listing.country)}
              {meta(
                "Distance",
                Number.isFinite(listing.distance_km)
                  ? `${Math.round(listing.distance_km)} km`
                  : null,
              )}
              {meta("Stages", listing.stage_count)}
              {meta("Waypoints", listing.waypoint_count)}
              {meta("Surface", listing.surface)}
              {meta(
                "Difficulty",
                listing.difficulty ? `${listing.difficulty}/5` : null,
              )}
            </dl>

            {listing.description && (
              <div className="mt-6 prose prose-sm max-w-none whitespace-pre-wrap text-gray-800">
                {listing.description}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
