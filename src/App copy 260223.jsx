// src/App.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";

import RallyLayout from "./RallyLayout";
import SignIn from "./auth/SignIn";
import ResetPassword from "./auth/ResetPassword";

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) {
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
            <RallyLayout />
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
