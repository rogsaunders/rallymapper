// src/library/SubmitRoute.jsx
//
// Author route-submission flow (Phase A). Gated to signed-in active authors.
// Steps: pick a RouteMapper export ZIP / stage.json → parse it client-side
// (shared parseRouteFile) → auto-derive complexity + bbox metadata → author
// fills the descriptive fields → submit (uploads the file + creates a
// `submitted` listing for curation).

import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { parseRouteFile } from "../travel/lib/roadbookParse";
import { deriveListingMetadata } from "./lib/deriveMetadata";
import { getAuthorStatus, submitRoute } from "./lib/submitApi";
import { useLibraryAuth } from "./lib/libraryAuth";
import LibrarySignIn from "./components/LibrarySignIn";
import LibraryHeader from "./components/LibraryHeader";

const ACTIVITIES = ["", "car", "rally", "4wd", "moto", "cycle", "walk"];

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-gray-50 border px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="text-sm font-medium text-gray-800">{value}</div>
    </div>
  );
}

export default function SubmitRoute() {
  const { user, loading, signOut } = useLibraryAuth();

  const [authorStatus, setAuthorStatus] = useState(undefined); // undefined=loading
  useEffect(() => {
    if (!user) {
      setAuthorStatus(undefined);
      return;
    }
    let active = true;
    getAuthorStatus(user.id).then((s) => active && setAuthorStatus(s));
    return () => {
      active = false;
    };
  }, [user]);

  // Parsed file + derived metadata
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [parseError, setParseError] = useState(null);

  // Editable descriptive fields
  const [fields, setFields] = useState({
    title: "",
    summary: "",
    description: "",
    activity: "",
    sub_type: "",
    region: "",
    country: "",
    surface: "",
    difficulty: "",
    tagsText: "",
  });
  const setField = (k, v) => setFields((f) => ({ ...f, [k]: v }));

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [doneId, setDoneId] = useState(null);

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setFile(f);
    setParsing(true);
    setParseError(null);
    setMetadata(null);
    try {
      const parsed = await parseRouteFile(f);
      const meta = deriveListingMetadata(parsed);
      setMetadata(meta);
      if (meta.suggestedTitle && !fields.title) {
        setField("title", meta.suggestedTitle);
      }
    } catch (err) {
      setParseError(err?.message || String(err));
      setFile(null);
    } finally {
      setParsing(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!file || !metadata) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const tags = fields.tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const id = await submitRoute({
        userId: user.id,
        file,
        fields: {
          ...fields,
          difficulty: fields.difficulty ? Number(fields.difficulty) : null,
          tags,
        },
        metadata,
      });
      setDoneId(id);
    } catch (err) {
      setSubmitError(err?.message || String(err));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Gates ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Shell>
        <p className="text-sm text-gray-500">Loading…</p>
      </Shell>
    );
  }
  if (!user) {
    return (
      <Shell>
        <LibrarySignIn reason="Sign in to submit a route to the Library." />
      </Shell>
    );
  }
  if (authorStatus === undefined) {
    return (
      <Shell>
        <p className="text-sm text-gray-500">Checking author access…</p>
      </Shell>
    );
  }
  if (authorStatus !== "active") {
    return (
      <Shell>
        <div className="max-w-md mx-auto bg-white rounded-2xl border shadow-sm p-6">
          <h1 className="text-lg font-bold text-gray-900">
            Author access required
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            You're signed in as {user.email}, but route authoring is currently
            by invitation. {authorStatus ? `(status: ${authorStatus})` : ""}
          </p>
          <div className="mt-4 flex gap-3 text-sm">
            <Link to="/library" className="text-[#588233] underline">
              Browse the Library
            </Link>
            <button
              type="button"
              onClick={() => signOut()}
              className="text-gray-500 underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────
  if (doneId) {
    return (
      <Shell>
        <div className="max-w-md mx-auto bg-white rounded-2xl border shadow-sm p-6 text-center">
          <div className="text-4xl mb-2">✅</div>
          <h1 className="text-lg font-bold text-gray-900">Submitted</h1>
          <p className="mt-2 text-sm text-gray-600">
            Your route is in the review queue. It'll appear in the Library once
            approved.
          </p>
          <div className="mt-4 flex justify-center gap-3 text-sm">
            <Link to="/library" className="text-[#588233] underline">
              Back to Library
            </Link>
            <button
              type="button"
              onClick={() => {
                setDoneId(null);
                setFile(null);
                setMetadata(null);
                setFields({
                  title: "",
                  summary: "",
                  description: "",
                  activity: "",
                  sub_type: "",
                  region: "",
                  country: "",
                  surface: "",
                  difficulty: "",
                  tagsText: "",
                });
              }}
              className="text-[#588233] underline"
            >
              Submit another
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────
  return (
    <Shell>
      <div className="max-w-2xl mx-auto">
        <Link to="/library" className="text-sm text-[#588233] hover:underline">
          ← Back to library
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Submit a route</h1>
        <p className="mt-1 text-sm text-gray-600">
          Upload a RouteMapper export ZIP (or <code>stage.json</code>). We'll
          read its stats automatically — you add the details.
        </p>

        <div className="mt-5">
          <label className="inline-block px-4 py-2.5 rounded-xl text-white font-semibold cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: "#588233" }}>
            {parsing ? "Reading…" : file ? "📂 Choose a different file" : "📂 Choose route file"}
            <input
              type="file"
              accept=".zip,.json,application/zip,application/json"
              onChange={onFile}
              className="hidden"
              disabled={parsing}
            />
          </label>
          {file && !parsing && (
            <span className="ml-3 text-sm text-gray-600">{file.name}</span>
          )}
          {parseError && (
            <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {parseError}
            </div>
          )}
        </div>

        {metadata && (
          <form onSubmit={onSubmit} className="mt-6 space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Stages" value={metadata.stage_count} />
              <Stat
                label="Distance"
                value={metadata.distance_km != null ? `${metadata.distance_km} km` : "—"}
              />
              <Stat label="Waypoints" value={metadata.waypoint_count} />
              <Stat
                label="Located"
                value={metadata.center_lat != null ? "Yes" : "No coords"}
              />
            </div>

            <Field label="Title *">
              <input
                required
                value={fields.title}
                onChange={(e) => setField("title", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Summary">
              <input
                value={fields.summary}
                onChange={(e) => setField("summary", e.target.value)}
                placeholder="One line shown on the card"
                className={inputCls}
              />
            </Field>
            <Field label="Description">
              <textarea
                rows={4}
                value={fields.description}
                onChange={(e) => setField("description", e.target.value)}
                className={inputCls}
              />
            </Field>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Activity">
                <select
                  value={fields.activity}
                  onChange={(e) => setField("activity", e.target.value)}
                  className={inputCls}
                >
                  {ACTIVITIES.map((a) => (
                    <option key={a || "none"} value={a}>
                      {a ? a : "— select —"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Sub-type">
                <input
                  value={fields.sub_type}
                  onChange={(e) => setField("sub_type", e.target.value)}
                  placeholder="trail / adventure / road…"
                  className={inputCls}
                />
              </Field>
              <Field label="Region">
                <input
                  value={fields.region}
                  onChange={(e) => setField("region", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Country (ISO-2)">
                <input
                  value={fields.country}
                  onChange={(e) => setField("country", e.target.value)}
                  placeholder="AU"
                  maxLength={2}
                  className={inputCls}
                />
              </Field>
              <Field label="Surface">
                <input
                  value={fields.surface}
                  onChange={(e) => setField("surface", e.target.value)}
                  placeholder="sealed / gravel / sand / mixed / technical"
                  className={inputCls}
                />
              </Field>
              <Field label="Difficulty (1–5)">
                <select
                  value={fields.difficulty}
                  onChange={(e) => setField("difficulty", e.target.value)}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Tags (comma-separated)">
              <input
                value={fields.tagsText}
                onChange={(e) => setField("tagsText", e.target.value)}
                placeholder="desert, river-crossing, scenic"
                className={inputCls}
              />
            </Field>

            <p className="text-xs text-gray-500">
              Free to download (Phase A). By submitting you agree to the{" "}
              content policy &amp; author terms.
            </p>

            {submitError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !fields.title.trim()}
              className="w-full sm:w-auto px-6 py-3 rounded-xl text-white font-semibold disabled:opacity-50"
              style={{ backgroundColor: "#588233" }}
            >
              {submitting ? "Submitting…" : "Submit for review"}
            </button>
          </form>
        )}
      </div>
    </Shell>
  );
}

const inputCls =
  "w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#588233]/40";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <LibraryHeader />
      <div className="max-w-6xl mx-auto px-4 py-6">{children}</div>
    </div>
  );
}
