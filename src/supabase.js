import { createClient } from "@supabase/supabase-js";

/* Vite injects import.meta.env in the browser build. The fallback to
   process.env is what lets the data layer be exercised from a plain
   Node script without standing the whole app up. */
const env =
  (typeof import.meta !== "undefined" && import.meta.env) ||
  (typeof process !== "undefined" && process.env) ||
  {};

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
      "Set both in the Netlify environment (and in .env.local for local dev)."
  );
}

export const supabase = createClient(url, key);
