// Auth.jsx — improved spacing and layout
import React, { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Auth({ onAuthSuccess, onGuest }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [isReset, setIsReset] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  const redirectTo = `${window.location.origin}/auth/reset`;

  const resetAlerts = () => {
    setMessage("");
    setError("");
  };

  const handleAuth = async (e) => {
    setLoading(true);
    e.preventDefault();
    resetAlerts();

    const emailTrimmed = email.trim();

    if (!emailTrimmed) {
      setError("Please enter your email.");
      return;
    }
    if (!isReset && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    try {
      setLoading(true);

      if (isReset) {
        const redirectTo = import.meta.env.DEV
          ? "https://localhost:5173/auth/callback"
          : "https://routemapper.net/auth/callback";

        console.log(
          "[RESET] sending reset for:",
          emailTrimmed,
          "redirectTo:",
          redirectTo,
        );

        const { data, error } = await supabase.auth.resetPasswordForEmail(
          emailTrimmed,
          {
            redirectTo,
          },
        );

        console.log("[RESET] response:", { data, error });

        if (error) throw error;

        setMessage("Password reset email sent. Check your inbox.");
        return;
      }

      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: emailTrimmed,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/auth/callback",
          },
        });
        if (error) throw error;
        setMessage(
          data?.user?.identities?.length
            ? "Sign-up successful. Please check your email to confirm your account."
            : "If this email is new, check your inbox to confirm your account.",
        );
        return;
      }

      // Sign in (password grant)
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailTrimmed,
        password,
      });
      if (error) throw error;

      // success
      setMessage("Signed in successfully.");
      onAuthSuccess?.(data?.user ?? data?.session?.user ?? null);
    } catch (err) {
      // Surface clear messages for common 400s
      const raw = err?.message || "Authentication failed.";
      let friendly = raw;
      if (/invalid login credentials/i.test(raw))
        friendly = "Invalid email or password.";
      if (/email not confirmed/i.test(raw))
        friendly = "Email not confirmed. Please check your inbox.";
      setError(friendly);
      console.error("Supabase auth error:", err);
      console.error("[AUTH] error:", err);
      setError(err?.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  const containerStyle = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
  };

  const formContainerStyle = {
    width: "100%",
    maxWidth: "400px",
    backgroundColor: "white",
    borderRadius: "12px",
    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
    padding: "2rem",
  };

  const inputStyle = {
    width: "100%",
    padding: "0.75rem",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "1rem",
    fontFamily: "inherit",
  };

  const buttonStyle = {
    width: "100%",
    padding: "0.75rem 1rem",
    borderRadius: "6px",
    fontSize: "1rem",
    fontWeight: "500",
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
  };

  const primaryButtonStyle = {
    ...buttonStyle,
    backgroundColor: loading ? "rgba(88 130 52 / 0.7)" : "rgba(88 130 52 / 1)",
    color: "white",
    cursor: loading ? "not-allowed" : "pointer",
  };

  const secondaryButtonStyle = {
    ...buttonStyle,
    backgroundColor: "white",
    color: "#374151",
    border: "1px solid #d1d5db",
  };

  return (
    <div className="bg-gray-100" style={containerStyle}>
      <div style={formContainerStyle}>
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: "600",
            marginBottom: "0.5rem",
            color: "#111827",
          }}
        >
          {isReset ? "Reset Password" : isSignUp ? "Create Account" : "Sign In"}
        </h1>
        <p
          style={{
            fontSize: "0.875rem",
            color: "#6b7280",
            marginBottom: "2rem",
          }}
        >
          {isReset
            ? "Enter your email and we'll send you a reset link."
            : isSignUp
              ? "Create your Route Mapper account."
              : "Sign in to continue to Route Mapper."}
        </p>

        {message && (
          <div
            style={{
              marginBottom: "1rem",
              padding: "0.75rem",
              backgroundColor: "#f0fdf4",
              color: "#166534",
              border: "1px solid #bbf7d0",
              borderRadius: "6px",
              fontSize: "0.875rem",
            }}
          >
            {message}
          </div>
        )}

        {error && (
          <div
            style={{
              marginBottom: "1rem",
              padding: "0.75rem",
              backgroundColor: "#fef2f2",
              color: "#991b1b",
              border: "1px solid #fecaca",
              borderRadius: "6px",
              fontSize: "0.875rem",
            }}
          >
            {error}
          </div>
        )}

        <form
          onSubmit={handleAuth}
          style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
        >
          {/* Email Field */}
          <div>
            <label
              htmlFor="email"
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: "500",
                color: "#374151",
                marginBottom: "0.5rem",
              }}
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              placeholder="you@example.com"
              required
            />
          </div>

          {/* Password Field */}
          {!isReset && (
            <div>
              <label
                htmlFor="password"
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ ...inputStyle, paddingRight: "3rem" }}
                  placeholder={
                    isSignUp ? "Create a password" : "Enter your password"
                  }
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  style={{
                    position: "absolute",
                    right: "0.75rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    fontSize: "0.875rem",
                    color: "#6b7280",
                    cursor: "pointer",
                  }}
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          )}

          <button type="submit" disabled={loading} style={primaryButtonStyle}>
            {loading
              ? "Please wait…"
              : isReset
                ? "Send Reset Link"
                : isSignUp
                  ? "Create Account"
                  : "Sign In"}
          </button>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.875rem",
              gap: "1rem",
            }}
          >
            {!isReset && (
              <button
                type="button"
                onClick={() => {
                  resetAlerts();
                  setIsSignUp((s) => !s);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(88 130 52 / 0.7)",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                {isSignUp
                  ? "Have an account? Sign in"
                  : "New here? Create an account"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                resetAlerts();
                setIsReset((r) => !r);
              }}
              style={{
                background: "none",
                border: "none",
                color: "#6b7280",
                cursor: "pointer",
                textDecoration: "underline",
                marginLeft: "auto",
              }}
            >
              {isReset ? "Back to sign in" : "Forgot password?"}
            </button>
          </div>

          <div style={{ paddingTop: "1rem" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <button
                type="button"
                onClick={() => onGuest?.()}
                style={secondaryButtonStyle}
              >
                Continue as Guest
              </button>
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "#6b7280",
                  textAlign: "center",
                }}
              >
                Guest mode: data is stored locally and won't sync to cloud.
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
