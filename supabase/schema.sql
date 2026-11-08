-- Zaply: base de autenticação e sinalização de chamadas
-- Execute este arquivo no SQL Editor do seu projeto Supabase.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Usuário Zaply',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'ringing'
    check (status in ('ringing','accepted','rejected','ended','missed')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz
);

create table if not exists public.call_candidates (
  id bigint generated always as identity primary key,
  call_id uuid not null references public.calls(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  candidate jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists calls_callee_status_idx
  on public.calls (callee_id, status, created_at desc);
create index if not exists call_candidates_call_idx
  on public.call_candidates (call_id, id);

alter table public.profiles enable row level security;
alter table public.calls enable row level security;
alter table public.call_candidates enable row level security;

drop policy if exists "profiles readable by signed-in users" on public.profiles;
create policy "profiles readable by signed-in users"
  on public.profiles for select to authenticated using (true);
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "call participants can read" on public.calls;
create policy "call participants can read"
  on public.calls for select to authenticated
  using (auth.uid() = caller_id or auth.uid() = callee_id);
drop policy if exists "caller can start call" on public.calls;
create policy "caller can start call"
  on public.calls for insert to authenticated with check (auth.uid() = caller_id);
drop policy if exists "participants can update call" on public.calls;
create policy "participants can update call"
  on public.calls for update to authenticated
  using (auth.uid() = caller_id or auth.uid() = callee_id)
  with check (auth.uid() = caller_id or auth.uid() = callee_id);

drop policy if exists "participants can read call candidates" on public.call_candidates;
create policy "participants can read call candidates"
  on public.call_candidates for select to authenticated
  using (exists (
    select 1 from public.calls c
    where c.id = call_id and (c.caller_id = auth.uid() or c.callee_id = auth.uid())
  ));
drop policy if exists "participants can send call candidates" on public.call_candidates;
create policy "participants can send call candidates"
  on public.call_candidates for insert to authenticated
  with check (sender_id = auth.uid() and exists (
    select 1 from public.calls c
    where c.id = call_id and (c.caller_id = auth.uid() or c.callee_id = auth.uid())
  ));

-- Cria um perfil automaticamente quando alguém cria conta por e-mail/senha.
create or replace function public.handle_new_zaply_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_zaply_auth_user_created on auth.users;
create trigger on_zaply_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_zaply_user();

-- Habilite Realtime para public.calls e public.call_candidates no painel do Supabase.
