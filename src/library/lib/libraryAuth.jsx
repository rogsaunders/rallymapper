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
  const [isAdmin, setIsAdmin] = useState(false);

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

  // Resolve the admin flag from the user's own route_authors row (RLS allows
  // reading your own row). Drives the Admin link + review page gate; the
  // server re-checks is_admin authoritatively before any curation action.
  useEffect(() => {
    let active = true;
    const userId = session?.user?.id;
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    supabase
      .from("route_authors")
      .select("is_admin")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setIsAdmin(!!data?.is_admin);
      });
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    isAdmin,
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
