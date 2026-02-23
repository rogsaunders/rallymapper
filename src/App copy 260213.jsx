// src/App.jsx
import React from "react";
import RallyLayout from "./RallyLayout";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import SignIn from "./auth/SignIn";

function AppGate() {
  const { loading, user, guestMode } = useAuth();

  if (loading) return <div className="p-6">Loading…</div>;

  if (user || guestMode) return <RallyLayout />;

  return <SignIn />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  );
}
