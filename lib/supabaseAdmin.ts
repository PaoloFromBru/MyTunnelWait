// Server-only Supabase admin client (service role)
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error('supabaseAdmin() deve essere usato solo lato server.');
  }
  if (_client) return _client;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error('Manca SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL).');
  if (!serviceKey) throw new Error('Manca SUPABASE_SERVICE_ROLE_KEY (service role).');

  _client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  });

  return _client;
}
