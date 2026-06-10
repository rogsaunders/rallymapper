// src/App.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";

import RouteMapperLayout from "./RouteMapperLayout";
import SignIn from "./auth/SignIn";
import ResetPassword from "./auth/ResetPassword";
import TravelMode from "./travel/TravelMode";
import ReviewMode from "./review/ReviewMode";

function GuestOnly({ children }) {
  const { user, loading, guestMode } = useAuth();
  if (loading) return null;
  if (user || guestMode) return <Navigate to="/" replace />;
  return children;
}

function RequireAuth({ children }) {
  const { user, loading, guestMode } = useAuth();

  if (loading) return null;

  if (!user && !guestMode) {
    return <Navigate to="/auth" replace />;
  }

  return children;
}

<Route
  path="/auth"
  element={
    <GuestOnly>
      <SignIn />
    </GuestOnly>
  }
/>;

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<SignIn />} />

      {/* ✅ Reset-password landing page */}
      <Route path="/auth/reset" element={<ResetPassword />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <RouteMapperLayout />
          </RequireAuth>
        }
      />

      {/* Travel Mode (Phase 2 — formerly "Drive Mode"; renamed to
          cover cyclists, motorbike riders and trekkers as well as
          drivers). Logged-in users and guest mode both allowed; auth
          gate matches the recording side. */}
      <Route
        path="/travel"
        element={
          <RequireAuth>
            <TravelMode />
          </RequireAuth>
        }
      />

      {/* /drive → /travel redirect for back-compat with prior
          bookmarks, in-vehicle home-screen icons, and any shared
          URLs. Cheap to keep around indefinitely. */}
      <Route path="/drive" element={<Navigate to="/travel" replace />} />

      {/* Review Mode (Phase 3 — organiser workbench). Same auth model
          as Record/Drive; reads the active stage draft from
          localStorage and renders it side-by-side with the map. */}
      <Route
        path="/review"
        element={
          <RequireAuth>
            <ReviewMode />
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
