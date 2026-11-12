import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type HostRow = {
  id: string;
  secret_hash: string;
  google_refresh_enc: string | null;
  google_email: string | null;
  google_connected_at: string | null;
};

export type EventRow = {
  id: string;
  host_id: string;
  event_date: string;
  folder_label: string | null;
  drive_folder_id: string | null;
};

export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("missing supabase env");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function bumpRateLimit(
  db: SupabaseClient,
  key: string,
  limit: number,
  windowSec = 60,
): Promise<{ ok: boolean; count: number }> {
  const { data, error } = await db.rpc("bump_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_sec: windowSec,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: Boolean(row?.allowed), count: Number(row?.count ?? 0) };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || "unknown";
}
