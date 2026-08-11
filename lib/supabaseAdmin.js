import { createClient } from "@supabase/supabase-js";

// Server-side only client, uses the service_role key which bypasses
// Row Level Security. NEVER import this file from client components.
let client = null;

export function getSupabaseAdmin() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars"
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false },
  });

  return client;
}
