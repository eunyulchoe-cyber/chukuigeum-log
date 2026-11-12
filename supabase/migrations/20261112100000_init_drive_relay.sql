-- 축의금 로그: host Drive relay. Guest names and amounts are never stored here.

create extension if not exists pgcrypto;

create table if not exists public.hosts (
  id uuid primary key default gen_random_uuid(),
  secret_hash text not null,
  google_refresh_enc text,
  google_email text,
  google_connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id text primary key,
  host_id uuid not null references public.hosts(id) on delete cascade,
  event_date date not null,
  folder_label text,
  drive_folder_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_host_id_idx on public.events (host_id);

create table if not exists public.upload_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  event_id text not null references public.events(id) on delete cascade,
  guest_id text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists upload_tokens_active_guest_idx
  on public.upload_tokens (event_id, guest_id)
  where used_at is null;

create index if not exists upload_tokens_event_idx on public.upload_tokens (event_id);

create table if not exists public.videos (
  event_id text not null references public.events(id) on delete cascade,
  guest_id text not null,
  drive_file_id text not null,
  mime text,
  size_bytes bigint,
  completed_at timestamptz not null default now(),
  primary key (event_id, guest_id)
);

create table if not exists public.oauth_states (
  state text primary key,
  host_id uuid not null references public.hosts(id) on delete cascade,
  code_verifier text not null,
  return_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

alter table public.hosts enable row level security;
alter table public.events enable row level security;
alter table public.upload_tokens enable row level security;
alter table public.videos enable row level security;
alter table public.oauth_states enable row level security;
alter table public.rate_limits enable row level security;

-- No policies for anon/authenticated. Edge Functions use the service role, which bypasses RLS.
revoke all on table public.hosts from anon, authenticated;
revoke all on table public.events from anon, authenticated;
revoke all on table public.upload_tokens from anon, authenticated;
revoke all on table public.videos from anon, authenticated;
revoke all on table public.oauth_states from anon, authenticated;
revoke all on table public.rate_limits from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Cleanup helper for expired oauth states / rate windows (invoked by functions as needed)
create or replace function public.cleanup_relay_ephemera()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.oauth_states where created_at < now() - interval '20 minutes';
  delete from public.rate_limits where window_start < now() - interval '2 hours';
  delete from public.upload_tokens
    where used_at is null and expires_at < now() - interval '7 days';
$$;

revoke all on function public.cleanup_relay_ephemera() from public, anon, authenticated;

create or replace function public.bump_rate_limit(p_key text, p_limit integer, p_window_sec integer default 60)
returns table(allowed boolean, count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  w timestamptz;
  c integer;
begin
  w := to_timestamp(floor(extract(epoch from now()) / p_window_sec) * p_window_sec);
  insert into public.rate_limits(key, window_start, count)
  values (p_key, w, 1)
  on conflict (key, window_start)
  do update set count = public.rate_limits.count + 1
  returning public.rate_limits.count into c;
  allowed := c <= p_limit;
  count := c;
  return next;
end;
$$;

revoke all on function public.bump_rate_limit(text, integer, integer) from public, anon, authenticated;
