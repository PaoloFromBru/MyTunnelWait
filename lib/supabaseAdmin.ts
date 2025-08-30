// lib/supabaseAdmin.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") throw new Error("server-only");
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
