// src/auth/ResetPassword.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function ResetPassword() {
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const nav = useNavigate();

  const resetAlerts = () => {
    setMessage("");
    setError("");
  };

  // Verify session / consume code if present
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // If the reset link uses PKCE/code flow, exchange it for a session
        if (window.location.search.includes("code=")) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(window.location.search);

          if (exchangeError) {
            if (mounted) setError(exchangeError.message);
            return;
          }
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (!mounted) return;

        if (sessionError) {
          setError(sessionError.message);
        } else if (!data?.session) {
          setError(
            "Reset link not active. Please open the password reset link from your email again.",
          );
        }
      } finally {
        if (mounted) setCheckingSession(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    resetAlerts();

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) throw updateError;

      setMessage("Password updated successfully. Please sign in.");
      setPassword("");
      setConfirm("");

      // Force clean auth state (prevents stale refresh-token issues)
      await supabase.auth.signOut();

      // Optional: take them back to sign-in
      nav("/auth", { replace: true });
    } catch (err) {
      setError(err?.message || "Could not update password.");
      console.error("Supabase update password error:", err);
    } finally {
      setLoading(false);
    }
  };

  // (keep your styles below as-is)

  // Styles aligned with your Auth.jsx
  const containerStyle = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
  };

  const formContainerStyle = {
    width: "100%",
    maxWidth: "420px",
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
    fontWeight: 400, // ✅ not bold (as you prefer)
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
  };

  const primaryButtonStyle = {
    ...buttonStyle,
    backgroundColor: loading ? "#588233" : "rgba(88 130 51 / 0.92)",
    color: "white",
    cursor: loading ? "not-allowed" : "pointer",
  };

  const subtleLinkStyle = {
    background: "none",
    border: "none",
    color: "rgba(88 130 51 / 0.92)",
    cursor: "pointer",
    textDecoration: "underline",
    padding: 0,
    fontSize: "0.875rem",
  };

  return (
    <div className="bg-gray-100" style={containerStyle}>
      <div style={formContainerStyle}>
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 600,
            marginBottom: "0.5rem",
            color: "#111827",
          }}
        >
          Set New Password
        </h1>

        <p
          style={{
            fontSize: "0.875rem",
            color: "#6b7280",
            marginBottom: "1.5rem",
          }}
        >
          Enter a new password for your Route Mapper account.
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
          onSubmit={handleUpdatePassword}
          style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
        >
          <div>
            <label
              htmlFor="new-password"
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "#374151",
                marginBottom: "0.5rem",
              }}
            >
              New password
            </label>

            <div style={{ position: "relative" }}>
              <input
                id="new-password"
                name="newPassword"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ ...inputStyle, paddingRight: "3.25rem" }}
                placeholder="At least 6 characters"
                required
                minLength={6}
                disabled={checkingSession}
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

          <div>
            <label
              htmlFor="confirm-password"
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "#374151",
                marginBottom: "0.5rem",
              }}
            >
              Confirm password
            </label>

            <input
              id="confirm-password"
              name="confirmPassword"
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={inputStyle}
              placeholder="Re-enter password"
              required
              minLength={6}
              disabled={checkingSession}
            />
          </div>

          <button
            type="submit"
            disabled={loading || checkingSession}
            style={primaryButtonStyle}
          >
            {checkingSession
              ? "Checking link…"
              : loading
                ? "Updating…"
                : "Update Password"}
          </button>

          <div style={{ textAlign: "center" }}>
            <button
              type="button"
              onClick={() => nav("/auth")}
              style={subtleLinkStyle}
            >
              Back to app
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
