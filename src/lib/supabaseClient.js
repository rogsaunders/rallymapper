// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Hard fail in dev if env is wrong / missing
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "[Supabase] Missing env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
  );
}

// Optional: guard against accidentally pointing at the wrong project
const EXPECTED_PROJECT_REF = "rfmvyachiypzvtxpdvma"; // <-- put YOUR correct project ref here
const actualRef = (() => {
  try {
    return new URL(supabaseUrl).host.split(".")[0];
  } catch {
    return "";
  }
})();

if (import.meta.env.DEV && actualRef && actualRef !== EXPECTED_PROJECT_REF) {
  throw new Error(
    `[Supabase] Wrong project URL.\nExpected: ${EXPECTED_PROJECT_REF}\nGot: ${actualRef}\nCheck your .env`,
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: `routemapper-auth-${actualRef}`, // unique per project
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
