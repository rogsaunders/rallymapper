import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./AuthProvider";
import { useNavigate } from "react-router-dom";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";

const isBeta = import.meta.env.VITE_BETA_MODE === "true";

// Plans the marketing site can deep-link to via ?plan=<id>. We persist the
// chosen plan to localStorage so it survives the email-confirmation round
// trip on signup and the redirect to "/" on signin. RouteMapperLayout reads
// this key after auth completes and auto-opens the upgrade panel.
const PENDING_PLAN_KEY = "rm_pending_plan";
const VALID_PENDING_PLANS = new Set([
  "event_pass",
  "solo_monthly",
  "pro_monthly",
  "pro_yearly",
]);

export default function SignIn() {
  const { enableGuest, disableGuest } = useAuth();
  const [mode, setMode] = useState("signin"); // signin | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState(""); // E.164, e.g. "+61412345678"
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const nav = useNavigate();

  // Capture ?plan=<id> from the URL on mount (deep-link from marketing site).
  // Default the form to "signup" since deep-linkers are usually new users
  // arriving from a Pricing CTA. They can still toggle to Sign in.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const plan = params.get("plan");
    if (plan && VALID_PENDING_PLANS.has(plan)) {
      try {
        localStorage.setItem(PENDING_PLAN_KEY, plan);
      } catch {
        // localStorage write may fail in private mode; non-fatal.
      }
      setMode("signup");
    }
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setMsg("");
    setBusy(true);
    disableGuest();

    const emailTrimmed = email.trim();

    try {
      if (mode === "forgot") {
        // Use VITE_APP_URL when set (production deployment) so the reset link
        // in the email always points to the real app, not whatever localhost
        // the dev server happened to be on when the button was clicked.
        const appOrigin =
          import.meta.env.VITE_APP_URL?.replace(/\/$/, "") ||
          window.location.origin;
        const redirectTo = `${appOrigin}/auth/reset`;

        const { error } = await supabase.auth.resetPasswordForEmail(
          emailTrimmed,
          {
            redirectTo,
          },
        );
        if (error) throw error;

        setMsg("Password reset email sent. Check your inbox (and spam).");
        return;
      }

      if (mode === "signup") {
        const fullNameTrimmed = fullName.trim();
        if (!fullNameTrimmed) {
          setMsg("Please enter your full name.");
          return;
        }
        if (phone && !isValidPhoneNumber(phone)) {
          setMsg("Please enter a valid phone number, or leave it blank.");
          return;
        }

        const redirectTo = `${window.location.origin}/auth/reset`;

        const { data, error } = await supabase.auth.signUp({
          email: emailTrimmed,
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: {
              full_name: fullNameTrimmed,
              phone: phone || null,
            },
          },
        });

        console.log("SIGN UP RESPONSE:", { data, error });

        if (error) throw error;

        setMsg(
          "Account created. Please check your email to confirm your account.",
        );
        setMode("signin"); // optional, but nice UX
        return;
      }

      // mode === "signin"
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailTrimmed,
        password,
      });

      console.log("SIGN IN RESPONSE:", { data, error });
      if (error) throw error;

      setMsg("Signed in.");
      nav("/", { replace: true }); // ✅ go into the app
    } catch (e) {
      console.error("AUTH FAILED:", e);
      setMsg(e?.message || "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow p-8">
        <h1 className="text-4xl font-extrabold text-gray-900">Sign In</h1>
        <p className="text-gray-600 mt-2">
          Sign in to continue to Route Mapper.
        </p>
        <form onSubmit={onSubmit} className="mt-8 space-y-6">
          {mode === "signup" && (
            <div>
              <label className="block text-gray-800 font-semibold mb-2">
                Full name
              </label>
              <input
                id="full_name"
                name="full_name"
                className="w-full p-4 rounded-xl border bg-blue-50 border-gray-300"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                type="text"
                autoComplete="name"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-gray-800 font-semibold mb-2">
              Email
            </label>
            <input
              id="email"
              name="email"
              className="w-full p-4 rounded-xl border bg-blue-50 border-gray-300"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
            />
          </div>

          {mode === "signup" && (
            <div>
              <label className="block text-gray-800 font-semibold mb-2">
                Phone <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <PhoneInput
                international
                defaultCountry="AU"
                countryCallingCodeEditable={false}
                value={phone}
                onChange={(v) => setPhone(v || "")}
                className="rm-phone-input w-full p-4 rounded-xl border bg-blue-50 border-gray-300"
                autoComplete="tel"
              />
              <p className="mt-1 text-xs text-gray-500">
                Used for SMS / 2FA, emergency contact, and support.
              </p>
            </div>
          )}

          {mode !== "forgot" && (
            <div>
              <label className="block text-gray-800 font-semibold mb-2">
                Password
              </label>
              <input
                id="password"
                name="password"
                className="w-full p-4 rounded-xl border bg-blue-50 border-gray-300"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                required
              />
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-4 rounded-xl font-bold text-white disabled:opacity-60"
            style={{ backgroundColor: "#588233" }}
          >
            {busy
              ? "Working…"
              : mode === "signup"
                ? "Create Account"
                : mode === "forgot"
                  ? "Send Reset Link"
                  : "Sign In"}
          </button>

          <div className="flex justify-between text-sm">
            {!isBeta && (
              <button
                type="button"
                className="underline text-green-700"
                onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              >
                {mode === "signup"
                  ? "Have an account? Sign in"
                  : "New here? Create an account"}
              </button>
            )}

            <button
              type="button"
              className="underline text-gray-700"
              onClick={() => setMode(mode === "forgot" ? "signin" : "forgot")}
            >
              {mode === "forgot" ? "Back to sign in" : "Forgot password?"}
            </button>
          </div>

          {!!msg && <div className="text-sm text-gray-700">{msg}</div>}
        </form>
        <div className="mt-10 border-t pt-6">
          {isBeta ? (
            <p className="text-center text-sm text-gray-500">
              This is a private beta. Sign in with the credentials provided to you.
            </p>
          ) : (
            <>
              <button
                type="button"
                className="w-full py-4 rounded-xl font-bold border border-gray-300 text-gray-800 bg-white"
                onClick={enableGuest}
              >
                Continue as Guest
              </button>
              <p className="mt-3 text-center text-xs text-gray-500">
                Guest mode: data is stored locally and won&apos;t sync to cloud.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
