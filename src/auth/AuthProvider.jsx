import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../lib/supabaseClient";

const AuthCtx = createContext(null);
const GUEST_KEY = "rm_guest_mode";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guestMode, setGuestMode] = useState(
    () => localStorage.getItem(GUEST_KEY) === "1",
  );

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session || null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession || null);

        // When a password recovery link is opened, redirect to the reset page
        // regardless of where Supabase initially lands the user.
        if (event === "PASSWORD_RECOVERY") {
          window.location.replace("/auth/reset");
        }
      },
    );

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const value = useMemo(() => {
    return {
      session,
      user: session?.user ?? null,
      loading,
      guestMode,
      enableGuest: () => {
        localStorage.setItem(GUEST_KEY, "1");
        setGuestMode(true);
      },
      disableGuest: () => {
        localStorage.removeItem(GUEST_KEY);
        setGuestMode(false);
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    };
  }, [session, loading, guestMode]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
