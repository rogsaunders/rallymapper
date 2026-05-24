// src/App.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";

import RouteMapperLayout from "./RouteMapperLayout";
import SignIn from "./auth/SignIn";
import ResetPassword from "./auth/ResetPassword";
import DriveMode from "./drive/DriveMode";

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

      {/* Drive Mode (Phase 2). Logged-in users and guest mode both
          allowed; auth gate matches the recording side. */}
      <Route
        path="/drive"
        element={
          <RequireAuth>
            <DriveMode />
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
