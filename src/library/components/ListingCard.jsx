// src/library/components/ListingCard.jsx
//
// One card in the Route Library browse grid.

import React from "react";
import { Link } from "react-router-dom";
import { previewUrl } from "../lib/libraryApi";

const ACTIVITY_LABEL = {
  car: "Car",
  rally: "Rally",
  "4wd": "4WD",
  moto: "Motorbike",
  cycle: "Cycle",
  walk: "Walk",
};

function priceLabel(cents, currency) {
  if (!cents) return "Free";
  return `${(currency || "aud").toUpperCase()} $${(cents / 100).toFixed(2)}`;
}

export default function ListingCard({ listing }) {
  const img = previewUrl(listing.preview_path);
  const activity = ACTIVITY_LABEL[listing.activity] || listing.activity;

  return (
    <Link
      to={listing.id}
      className="block bg-white rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition"
    >
      <div className="aspect-[16/9] bg-gray-100 flex items-center justify-center">
        {img ? (
          <img
            src={img}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="text-3xl">🗺️</span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-gray-900 leading-snug line-clamp-2">
            {listing.title}
          </h3>
          <span
            className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: "#588233" }}
          >
            {priceLabel(listing.price_cents, listing.currency)}
          </span>
        </div>
        {listing.summary && (
          <p className="mt-1 text-sm text-gray-600 line-clamp-2">
            {listing.summary}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
          {activity && <span className="font-medium text-gray-600">{activity}</span>}
          {listing.region && <span>📍 {listing.region}</span>}
          {Number.isFinite(listing.distance_km) && (
            <span>📏 {Math.round(listing.distance_km)} km</span>
          )}
          {listing.stage_count > 1 && <span>🧩 {listing.stage_count} stages</span>}
        </div>
      </div>
    </Link>
  );
}
