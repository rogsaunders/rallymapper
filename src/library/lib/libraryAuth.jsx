// src/library/lib/libraryAuth.jsx
//
// Minimal auth context for the Route Library surface (approach A: Supabase
// auth on go.routemapper.net, lazy-loaded with /library). Authors sign in
// with their existing RouteMapper subscriber credentials — there is no
// sign-up here (accounts are created in the editor), so this is a thin
// wrapper over supabase.auth, separate from the editor's richer AuthProvider.

import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const Ctx = createContext(null);

export function LibraryAuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session || null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signIn: (email, password) =>
      supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLibraryAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLibraryAuth must be used within LibraryAuthProvider");
  return ctx;
}
