// src/library/components/LibrarySignIn.jsx
//
// Email/password sign-in for the Route Library (approach A). Authors use
// their existing RouteMapper subscriber credentials. No sign-up/reset here —
// those live in the editor (app.routemapper.net).

import React, { useState } from "react";
import { useLibraryAuth } from "../lib/libraryAuth";

export default function LibrarySignIn({ reason }) {
  const { signIn } = useLibraryAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await signIn(email.trim(), password);
    if (error) {
      setError(error.message || "Sign-in failed.");
      setBusy(false);
    }
    // On success the auth listener updates context and this unmounts.
  }

  return (
    <div className="max-w-sm mx-auto mt-10 bg-white rounded-2xl border shadow-sm p-6">
      <h1 className="text-lg font-bold text-gray-900">Author sign-in</h1>
      <p className="mt-1 text-sm text-gray-600">
        {reason || "Sign in with your RouteMapper account to submit routes."}
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#588233]/40"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#588233]/40"
        />
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full px-4 py-2.5 rounded-xl text-white font-semibold disabled:opacity-50"
          style={{ backgroundColor: "#588233" }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-xs text-gray-500">
        New here, or forgot your password? Manage your account in the{" "}
        <a href={__EDITOR_HOME__} className="text-[#588233] underline">
          RouteMapper app
        </a>
        .
      </p>
    </div>
  );
}
