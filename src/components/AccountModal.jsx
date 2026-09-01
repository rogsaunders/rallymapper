import React, { useEffect, useRef, useState } from "react";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabaseClient";
import { updateProfile } from "../lib/profile";
import { fetchEventPasses, activateEventPass } from "../lib/eventPass";

const PLAN_LABELS = {
  free: "Free",
  event_pass: "Event Pass",
  solo_monthly: "Solo (monthly)",
  pro_monthly: "Pro (monthly)",
  pro_yearly: "Pro (yearly)",
};

// Allowed username chars: lowercase letters, digits, dot, hyphen, underscore.
const USERNAME_RE = /^[a-z0-9._-]{2,32}$/;

export default function AccountModal({
  open,
  onClose,
  onUpgradeRequest,
  onManagePlan,
}) {
  const { user, profile, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");

  const [usernameStatus, setUsernameStatus] = useState("idle"); // idle | checking | available | taken | invalid
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Event passes
  const [passes, setPasses] = useState([]);
  const [eventName, setEventName] = useState("");
  const [activating, setActivating] = useState(false);
  const [passMsg, setPassMsg] = useState("");

  // Repopulate form whenever the modal opens or the profile changes
  useEffect(() => {
    if (!open) return;
    setFullName(profile?.full_name || "");
    setUsername(profile?.username || "");
    setPhone(profile?.phone || "");
    setUsernameStatus("idle");
    setMsg("");
    setPassMsg("");
    setEventName("");
  }, [open, profile]);

  // Load the user's event passes when the modal opens (and after the plan
  // changes, e.g. right after activation).
  useEffect(() => {
    if (!open || !user?.id) return;
    let cancelled = false;
    fetchEventPasses(user.id).then((rows) => {
      if (!cancelled) setPasses(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, user?.id, profile?.plan]);

  // Debounced username availability check
  const checkSeq = useRef(0);
  useEffect(() => {
    if (!open) return;
    const original = (profile?.username || "").toLowerCase();
    const next = (username || "").toLowerCase();

    if (next === original) {
      setUsernameStatus("idle");
      return;
    }
    if (!USERNAME_RE.test(next)) {
      setUsernameStatus("invalid");
      return;
    }

    setUsernameStatus("checking");
    const seq = ++checkSeq.current;
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", next)
        .neq("id", user?.id || "")
        .limit(1);

      if (seq !== checkSeq.current) return; // a newer keystroke superseded us
      if (error) {
        setUsernameStatus("idle");
        return;
      }
      setUsernameStatus(data && data.length > 0 ? "taken" : "available");
    }, 350);

    return () => clearTimeout(t);
  }, [username, open, profile?.username, user?.id]);

  if (!open) return null;

  const fullNameTrimmed = fullName.trim();
  const usernameTrimmed = username.trim().toLowerCase();
  const usernameChanged = usernameTrimmed !== (profile?.username || "").toLowerCase();
  const phoneInvalid = !!phone && !isValidPhoneNumber(phone);

  const canSave =
    !saving &&
    fullNameTrimmed.length > 0 &&
    !phoneInvalid &&
    (!usernameChanged ||
      usernameStatus === "available" ||
      usernameStatus === "idle");

  async function onSave() {
    setMsg("");
    if (!fullNameTrimmed) {
      setMsg("Full name is required.");
      return;
    }
    if (phoneInvalid) {
      setMsg("Please enter a valid phone number, or clear the field.");
      return;
    }
    if (usernameChanged && !USERNAME_RE.test(usernameTrimmed)) {
      setMsg("Username must be 2–32 characters: letters, digits, . _ or -");
      return;
    }
    if (usernameChanged && usernameStatus === "taken") {
      setMsg("That username is already taken.");
      return;
    }

    setSaving(true);
    try {
      const fields = {
        full_name: fullNameTrimmed,
        phone: phone || null,
      };
      if (usernameChanged) fields.username = usernameTrimmed;

      await updateProfile(user.id, fields);
      await refreshProfile();
      setMsg("Saved.");
      // Close after a short beat so the user sees confirmation
      setTimeout(() => {
        setMsg("");
        onClose?.();
      }, 600);
    } catch (e) {
      // Most likely cause: unique constraint race on username
      const text = e?.message || "Save failed";
      setMsg(/duplicate|unique/i.test(text) ? "That username is already taken." : text);
    } finally {
      setSaving(false);
    }
  }

  const planLabel = PLAN_LABELS[profile?.plan] || PLAN_LABELS.free;

  const unusedPasses = passes.filter((p) => p.status === "unused");
  const activePass = passes
    .filter((p) => p.status === "active" && p.expires_at)
    .sort((a, b) => new Date(b.expires_at) - new Date(a.expires_at))[0];

  function daysLeft(iso) {
    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
  }

  async function handleActivatePass() {
    setActivating(true);
    setPassMsg("");
    try {
      await activateEventPass(eventName.trim());
      setEventName("");
      await refreshProfile?.();
      setPasses(await fetchEventPasses(user.id));
      setPassMsg("Event Pass activated — you're set for 60 days.");
    } catch (e) {
      setPassMsg(e?.message || "Could not activate pass.");
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="text-xl font-bold">Account</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Read-only email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <p className="p-2.5 bg-gray-50 rounded-lg text-sm text-gray-800">
              {user?.email || "—"}
            </p>
          </div>

          {/* Plan + change-plan action */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
            <div className="flex items-center gap-2">
              <p className="flex-1 p-2.5 bg-gray-50 rounded-lg text-sm text-gray-800">
                {planLabel}
              </p>
              {profile?.plan === "free" && onUpgradeRequest && (
                <button
                  type="button"
                  onClick={onUpgradeRequest}
                  className="shrink-0 px-3 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ backgroundColor: "#588233" }}
                >
                  Upgrade →
                </button>
              )}
              {profile?.plan &&
                profile.plan !== "free" &&
                profile.plan !== "event_pass" &&
                onManagePlan && (
                <button
                  type="button"
                  onClick={onManagePlan}
                  className="shrink-0 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
                >
                  Manage →
                </button>
              )}
            </div>
          </div>

          {/* Event Pass status / activation */}
          {(unusedPasses.length > 0 || activePass) && (
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="text-sm font-medium text-gray-700">Event Pass</div>

              {activePass && (
                <p className="text-sm text-gray-800">
                  ✓ Active{activePass.trip_name ? ` — ${activePass.trip_name}` : ""} · expires in{" "}
                  <span className="font-semibold">{daysLeft(activePass.expires_at)} days</span>{" "}
                  ({new Date(activePass.expires_at).toLocaleDateString()})
                </p>
              )}

              {unusedPasses.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 leading-snug">
                    You have {unusedPasses.length} event pass
                    {unusedPasses.length > 1 ? "es" : ""} ready. Activation starts
                    your <strong>60-day</strong> access — do it when your event
                    begins.
                  </p>
                  <input
                    type="text"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="Event name (optional)"
                    maxLength={120}
                    className="w-full p-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  />
                  <button
                    type="button"
                    onClick={handleActivatePass}
                    disabled={activating}
                    className="w-full px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                    style={{ backgroundColor: "#588233" }}
                  >
                    {activating ? "Activating…" : "Activate Event Pass"}
                  </button>
                </div>
              )}

              {passMsg && <p className="text-xs text-gray-600">{passMsg}</p>}
            </div>
          )}

          {/* Full name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-600"
              autoComplete="name"
            />
            <p className="mt-1 text-xs text-gray-500">
              Used as the billing name on Stripe and on generated roadbook PDFs.
            </p>
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              className="w-full p-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-600"
              autoComplete="username"
              spellCheck={false}
            />
            <p className="mt-1 text-xs text-gray-500">
              Public handle. 2–32 chars: letters, digits, . _ or -
            </p>
            {usernameChanged && (
              <p className="mt-1 text-xs">
                {usernameStatus === "checking" && (
                  <span className="text-gray-500">Checking availability…</span>
                )}
                {usernameStatus === "available" && (
                  <span className="text-green-700">✓ Available</span>
                )}
                {usernameStatus === "taken" && (
                  <span className="text-red-600">✗ Already taken</span>
                )}
                {usernameStatus === "invalid" && (
                  <span className="text-red-600">Invalid format</span>
                )}
              </p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <PhoneInput
              international
              defaultCountry="AU"
              countryCallingCodeEditable={false}
              value={phone}
              onChange={(v) => setPhone(v || "")}
              className="rm-phone-input w-full p-2.5 rounded-lg border border-gray-300"
              autoComplete="tel"
            />
            {phoneInvalid && (
              <p className="mt-1 text-xs text-red-600">Invalid phone number.</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Used for SMS / 2FA, emergency contact, and support.
            </p>
          </div>

          {!!msg && (
            <div
              className={`text-sm p-2 rounded ${
                msg === "Saved."
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {msg}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 p-5 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
          >
            Cancel
          </button>
          {/* User Guide link moved out of here into the OverflowMenu
              (just above Sign out) so it lives with the other
              identity / app-level secondary actions instead of in the
              Account-edit dialog. */}
          <button
            onClick={onSave}
            disabled={!canSave}
            className="ml-auto px-4 py-2 rounded-lg font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "#588233" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
