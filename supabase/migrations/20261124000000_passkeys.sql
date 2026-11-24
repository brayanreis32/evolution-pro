-- Confirmação em duas etapas por Face ID / digital (passkey / WebAuthn).
create table if not exists private.user_passkeys (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  credential_id  text not null unique,   -- base64url
  public_key     text not null,          -- base64url
  counter        bigint not null default 0,
  transports     text[],
  device_name    text,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz
);
create index if not exists user_passkeys_user on private.user_passkeys (user_id);

create table if not exists private.webauthn_challenges (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  challenge  text not null,
  kind       text not null check (kind in ('register', 'auth')),
  created_at timestamptz not null default now()
);

-- liberação (15 min) dada por qualquer forma de confirmação
create table if not exists private.mfa_grants (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  verified_until timestamptz not null
);

create or replace function public.pk_list(p_user uuid)
returns table (credential_id text, public_key text, counter bigint, transports text[])
language sql security definer set search_path = public, private
as $$ select credential_id, public_key, counter, transports from private.user_passkeys where user_id = p_user $$;

create or replace function public.pk_add(p_user uuid, p_cred text, p_key text, p_counter bigint, p_transports text[], p_name text)
returns void language sql security definer set search_path = public, private
as $$ insert into private.user_passkeys (user_id, credential_id, public_key, counter, transports, device_name)
      values (p_user, p_cred, p_key, p_counter, p_transports, p_name) $$;

create or replace function public.pk_used(p_cred text, p_counter bigint)
returns void language sql security definer set search_path = public, private
as $$ update private.user_passkeys set counter = p_counter, last_used_at = now() where credential_id = p_cred $$;

create or replace function public.pk_set_challenge(p_user uuid, p_challenge text, p_kind text)
returns void language sql security definer set search_path = public, private
as $$ insert into private.webauthn_challenges (user_id, challenge, kind) values (p_user, p_challenge, p_kind)
      on conflict (user_id) do update set challenge = excluded.challenge, kind = excluded.kind, created_at = now() $$;

-- devolve e apaga o desafio (uso único, vale 5 min)
create or replace function public.pk_take_challenge(p_user uuid, p_kind text)
returns text language plpgsql security definer set search_path = public, private
as $$
declare v text;
begin
  delete from private.webauthn_challenges
   where user_id = p_user and kind = p_kind and created_at > now() - interval '5 minutes'
  returning challenge into v;
  delete from private.webauthn_challenges where user_id = p_user;
  return v;
end;
$$;

create or replace function public.mfa_grant(p_user uuid)
returns void language sql security definer set search_path = public, private
as $$ insert into private.mfa_grants (user_id, verified_until) values (p_user, now() + interval '15 minutes')
      on conflict (user_id) do update set verified_until = excluded.verified_until $$;

create or replace function public.mfa_ok(p_user uuid)
returns boolean language sql stable security definer set search_path = public, private
as $$
  select exists (select 1 from private.mfa_grants where user_id = p_user and verified_until > now())
      or exists (select 1 from private.user_totp where user_id = p_user and verified and verified_until > now())
$$;

-- reinicia a confirmação de alguém (ex.: perdeu o celular) — usado pelo desenvolvedor
create or replace function public.mfa_reset_all(p_user uuid)
returns void language sql security definer set search_path = public, private
as $$
  delete from private.user_passkeys where user_id = p_user;
  delete from private.user_totp where user_id = p_user;
  delete from private.mfa_grants where user_id = p_user;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'pk_list(uuid)', 'pk_add(uuid,text,text,bigint,text[],text)', 'pk_used(text,bigint)',
    'pk_set_challenge(uuid,text,text)', 'pk_take_challenge(uuid,text)', 'mfa_grant(uuid)', 'mfa_ok(uuid)', 'mfa_reset_all(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
