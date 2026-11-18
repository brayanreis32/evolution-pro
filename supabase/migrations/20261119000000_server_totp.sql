-- Confirmação em duas etapas feita no nosso servidor (TOTP), num passo só.
-- O segredo fica no schema privado: só as Edge Functions (service role) leem.
create table if not exists private.user_totp (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  secret         text not null,          -- base32
  verified       boolean not null default false,
  verified_until timestamptz,            -- janela liberada para conectar/desconectar banco
  last_step      bigint,                 -- impede reusar o mesmo código
  failed         int not null default 0,
  locked_until   timestamptz,
  created_at     timestamptz not null default now()
);

create or replace function public.totp_get(p_user uuid)
returns table (secret text, verified boolean, verified_until timestamptz, last_step bigint, failed int, locked_until timestamptz)
language sql security definer set search_path = public, private
as $$ select secret, verified, verified_until, last_step, failed, locked_until from private.user_totp where user_id = p_user $$;

create or replace function public.totp_set_secret(p_user uuid, p_secret text)
returns void language sql security definer set search_path = public, private
as $$
  insert into private.user_totp (user_id, secret) values (p_user, p_secret)
  on conflict (user_id) do update set secret = excluded.secret, verified = false, verified_until = null,
    last_step = null, failed = 0, locked_until = null
  where private.user_totp.verified = false;
$$;

create or replace function public.totp_mark(p_user uuid, p_ok boolean, p_step bigint)
returns void language plpgsql security definer set search_path = public, private
as $$
begin
  if p_ok then
    update private.user_totp set verified = true, verified_until = now() + interval '15 minutes',
      last_step = p_step, failed = 0, locked_until = null where user_id = p_user;
  else
    update private.user_totp set failed = failed + 1,
      locked_until = case when failed + 1 >= 5 then now() + interval '10 minutes' else locked_until end
     where user_id = p_user;
  end if;
end;
$$;

-- reinicia o autenticador de alguém (ex.: perdeu o celular) — só desenvolvedor/admin pelo painel
create or replace function public.totp_reset(p_user uuid)
returns void language sql security definer set search_path = public, private
as $$ delete from private.user_totp where user_id = p_user $$;

revoke execute on function public.totp_get(uuid) from public, anon, authenticated;
revoke execute on function public.totp_set_secret(uuid, text) from public, anon, authenticated;
revoke execute on function public.totp_mark(uuid, boolean, bigint) from public, anon, authenticated;
revoke execute on function public.totp_reset(uuid) from public, anon, authenticated;
grant execute on function public.totp_get(uuid), public.totp_set_secret(uuid, text),
  public.totp_mark(uuid, boolean, bigint), public.totp_reset(uuid) to service_role;
