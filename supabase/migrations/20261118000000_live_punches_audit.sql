-- =====================================================================
-- Ponto: turnos que atravessam dias, turnos abertos, atualização ao vivo
-- e histórico de todas as alterações de batidas (nada se perde).
-- =====================================================================

create or replace function public.work_sessions(
  p_start    date,
  p_end      date,
  p_employee uuid default null
)
returns table (
  employee_id    uuid,
  work_date      date,
  site_id        uuid,
  clock_in       timestamptz,
  clock_out      timestamptz,
  break_minutes  numeric,
  worked_minutes numeric,
  is_open        boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_tz      text := public.company_tz();
  r         record;
  v_emp     uuid;
  v_in      timestamptz;
  v_site    uuid;
  v_bstart  timestamptz;
  v_break   interval;
begin
  -- funcionário só vê as próprias horas
  if not public.is_admin() then
    p_employee := auth.uid();
  end if;

  for r in
    -- começa na última ENTRADA antes do período (turno que vem de dias anteriores
    -- não some) e vai até a saída do último turno (mesmo que seja dias depois)
    with bounds as (
      select e.id as emp,
             coalesce((select max(x.punched_at) from public.time_punches x
                        where x.employee_id = e.id and x.punch = 'clock_in'
                          and x.punched_at < (p_start::timestamp at time zone v_tz)),
                      (p_start::timestamp at time zone v_tz)) as from_ts,
             -- até a primeira SAÍDA depois do fim do período (fecha turnos
             -- que terminaram dias depois); sem saída ainda: até agora
             coalesce((select min(x.punched_at) from public.time_punches x
                        where x.employee_id = e.id and x.punch = 'clock_out'
                          and x.punched_at >= ((p_end + 1)::timestamp at time zone v_tz)),
                      'infinity'::timestamptz) as to_ts
        from public.profiles e
       where (p_employee is null or e.id = p_employee)
    )
    select p.*
      from public.time_punches p
      join bounds b on b.emp = p.employee_id
     where (public.is_developer() or not public.is_developer_user(p.employee_id))
       and p.punched_at >= b.from_ts
       and p.punched_at <= b.to_ts
     order by p.employee_id, p.punched_at
  loop
    if v_emp is distinct from r.employee_id then
      -- trocou de funcionário: fecha o turno aberto anterior
      if v_in is not null and (v_in at time zone v_tz)::date <= p_end then
        employee_id := v_emp; work_date := (v_in at time zone v_tz)::date; site_id := v_site;
        clock_in := v_in; clock_out := null;
        break_minutes := round(extract(epoch from v_break
                         + coalesce(now() - v_bstart, interval '0')) / 60, 2);
        worked_minutes := round(extract(epoch from (now() - v_in)) / 60, 2) - break_minutes;
        is_open := true;
        return next;
      end if;
      v_emp := r.employee_id; v_in := null; v_bstart := null; v_break := interval '0';
    end if;

    case r.punch
      when 'clock_in' then
        v_in := r.punched_at; v_site := r.site_id; v_bstart := null; v_break := interval '0';
      when 'break_start' then
        if v_in is not null then v_bstart := r.punched_at; end if;
      when 'break_end' then
        if v_bstart is not null then
          v_break := v_break + (r.punched_at - v_bstart);
          v_bstart := null;
        end if;
      when 'clock_out' then
        if v_in is not null then
          if v_bstart is not null then           -- saiu sem voltar da pausa
            v_break := v_break + (r.punched_at - v_bstart);
          end if;
          if (v_in at time zone v_tz)::date between p_start and p_end then
            employee_id := v_emp; work_date := (v_in at time zone v_tz)::date; site_id := v_site;
            clock_in := v_in; clock_out := r.punched_at;
            break_minutes := round(extract(epoch from v_break) / 60, 2);
            worked_minutes := round(extract(epoch from (r.punched_at - v_in)) / 60, 2) - break_minutes;
            is_open := false;
            return next;
          end if;
          v_in := null; v_bstart := null; v_break := interval '0';
        end if;
    end case;
  end loop;

  -- último funcionário com turno aberto
  if v_in is not null and (v_in at time zone v_tz)::date between p_start and p_end then
    employee_id := v_emp; work_date := (v_in at time zone v_tz)::date; site_id := v_site;
    clock_in := v_in; clock_out := null;
    break_minutes := round(extract(epoch from v_break + coalesce(now() - v_bstart, interval '0')) / 60, 2);
    worked_minutes := round(extract(epoch from (now() - v_in)) / 60, 2) - break_minutes;
    is_open := true;
    return next;
  end if;
end;
$$;

-- Turnos em aberto agora (qualquer data): painel "quem está trabalhando",
-- aviso de ponto esquecido e tela do funcionário.
create or replace function public.open_shifts()
returns table (employee_id uuid, site_id uuid, clock_in timestamptz, on_break boolean, open_hours numeric)
language sql stable security definer set search_path = public
as $$
  with last_punch as (
    select distinct on (t.employee_id) t.employee_id, t.punch
      from public.time_punches t
     order by t.employee_id, t.punched_at desc
  ),
  last_in as (
    select distinct on (t.employee_id) t.employee_id, t.site_id, t.punched_at
      from public.time_punches t
     where t.punch = 'clock_in'
     order by t.employee_id, t.punched_at desc
  )
  select i.employee_id, i.site_id, i.punched_at, (l.punch = 'break_start'),
         round(extract(epoch from now() - i.punched_at) / 3600, 1)
    from last_punch l
    join last_in i on i.employee_id = l.employee_id
   where l.punch <> 'clock_out'
     and (i.employee_id = auth.uid()
          or public.is_developer()
          or (public.is_admin() and not public.is_developer_user(i.employee_id)));
$$;
grant execute on function public.open_shifts() to authenticated;

-- ---------------------------------------------------------------------
-- Histórico (auditoria) de batidas: toda inclusão, correção e exclusão
-- fica registrada com o valor antigo, o novo, quem fez e quando.
-- ---------------------------------------------------------------------
create table if not exists public.time_punch_audit (
  id          bigint generated always as identity primary key,
  punch_id    uuid not null,
  employee_id uuid,
  action      text not null check (action in ('insert', 'update', 'delete')),
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);
create index if not exists time_punch_audit_emp on public.time_punch_audit (employee_id, changed_at);

alter table public.time_punch_audit enable row level security;
drop policy if exists punch_audit_read on public.time_punch_audit;
create policy punch_audit_read on public.time_punch_audit for select
  using (public.is_developer() or (public.is_admin() and not public.is_developer_user(employee_id)));
-- ninguém altera nem apaga o histórico pelo app (não há política de escrita)

create or replace function public.audit_time_punch()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.time_punch_audit (punch_id, employee_id, action, old_data, new_data, changed_by)
  values (
    coalesce(new.id, old.id),
    coalesce(new.employee_id, old.employee_id),
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return null;
end;
$$;

drop trigger if exists time_punches_audit on public.time_punches;
create trigger time_punches_audit
  after insert or update or delete on public.time_punches
  for each row execute function public.audit_time_punch();

-- ---------------------------------------------------------------------
-- Atualização ao vivo (Supabase Realtime respeita a RLS de cada usuário)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.time_punches;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.site_assignments;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;
