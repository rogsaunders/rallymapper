import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../lib/supabaseClient";
import { fetchProfile } from "../lib/profile";

const AuthCtx = createContext(null);
const GUEST_KEY = "rm_guest_mode";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guestMode, setGuestMode] = useState(
    () => localStorage.getItem(GUEST_KEY) === "1",
  );

  // Fetch profile whenever the authenticated user changes.
  // Runs after session is set so the Supabase client has valid credentials.
  useEffect(() => {
    const userId = session?.user?.id ?? null;
    if (!userId) {
      setProfile(null);
      return;
    }
    fetchProfile(userId).then(setProfile);
  }, [session?.user?.id]);

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
      profile,                          // full profile row incl. plan
      plan: profile?.plan ?? "free",    // convenience shorthand
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
      // Call this after updateProfile() to keep the context in sync
      // without a full sign-out/sign-in cycle.
      refreshProfile: () =>
        fetchProfile(session?.user?.id).then(setProfile),
    };
  }, [session, profile, loading, guestMode]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
