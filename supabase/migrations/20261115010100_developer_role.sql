-- =====================================================================
-- Desenvolvedor: acesso total ao sistema, mas invisível e intocável
-- para os administradores.
-- =====================================================================

-- (security definer: enxerga o perfil mesmo quando a RLS o esconde do admin)
create or replace function public.is_developer_user(p_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = p_id and role = 'developer') $$;

create or replace function public.is_developer()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'developer' and active
  );
$$;

-- Desenvolvedor tem todas as permissões de administrador
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'developer') and active
  );
$$;

-- Perfis: admin não enxerga nem altera o desenvolvedor
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (
    id = auth.uid()
    or public.is_developer()
    or (public.is_admin() and role <> 'developer')
  );

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for update
  using (public.is_developer() or (public.is_admin() and role <> 'developer'))
  with check (public.is_developer() or (public.is_admin() and role <> 'developer'));

-- Folha e turnos: o desenvolvedor nunca aparece para o admin
create or replace function public.payroll_summary(p_start date, p_end date)
returns table (
  employee_id  uuid,
  full_name    text,
  hourly_rate  numeric,
  shifts       bigint,
  open_shifts  bigint,
  hours        numeric,
  amount       numeric
)
language sql stable security definer set search_path = public
as $$
  select p.id,
         p.full_name,
         p.hourly_rate,
         count(s.clock_in),
         count(s.clock_in) filter (where s.is_open),
         round(coalesce(sum(s.worked_minutes) filter (where not s.is_open), 0) / 60, 2),
         round(coalesce(sum(s.worked_minutes) filter (where not s.is_open), 0) / 60 * p.hourly_rate, 2)
    from public.profiles p
    left join public.work_sessions(p_start, p_end) s on s.employee_id = p.id
   where (public.is_admin() or p.id = auth.uid())
     and (p.role <> 'developer' or (public.is_developer() and s.clock_in is not null))
     and ((p.active and p.role = 'employee') or s.clock_in is not null)
   group by p.id, p.full_name, p.hourly_rate
   order by p.full_name;
$$;

-- Batidas do desenvolvedor (testes do ponto) ficam ocultas para o admin
drop policy if exists punches_select on public.time_punches;
create policy punches_select on public.time_punches for select
  using (
    employee_id = auth.uid()
    or public.is_developer()
    or (public.is_admin() and not public.is_developer_user(employee_id))
  );

drop policy if exists assign_select on public.site_assignments;
create policy assign_select on public.site_assignments for select
  using (
    employee_id = auth.uid()
    or public.is_developer()
    or (public.is_admin() and not public.is_developer_user(employee_id))
  );

-- Turnos: o admin não vê turnos do desenvolvedor
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
    select p.*
      from public.time_punches p
     where (p_employee is null or p.employee_id = p_employee)
       and (public.is_developer() or not exists (
             select 1 from public.profiles d where d.id = p.employee_id and d.role = 'developer'))
       and p.punched_at >= (p_start::timestamp at time zone v_tz)
       and p.punched_at <  ((p_end + 2)::timestamp at time zone v_tz) -- turno que vira a noite
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

-- O primeiro usuário de uma instalação nova vira desenvolvedor
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.user_role := 'employee';
begin
  if not exists (select 1 from public.profiles) then
    v_role := 'developer';
  end if;

  insert into public.profiles (id, full_name, email, role, hourly_rate, language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    v_role,
    coalesce((new.raw_user_meta_data ->> 'hourly_rate')::numeric, 0),
    coalesce(new.raw_user_meta_data ->> 'language', 'pt')
  );
  return new;
end;
$$;

-- As regras "admin pode tudo" também não podem alcançar dados do desenvolvedor

drop policy if exists punches_admin on public.time_punches;
create policy punches_admin on public.time_punches for all
  using (public.is_developer() or (public.is_admin() and not public.is_developer_user(employee_id)))
  with check (public.is_developer() or (public.is_admin() and not public.is_developer_user(employee_id)));

drop policy if exists assign_admin on public.site_assignments;
create policy assign_admin on public.site_assignments for all
  using (public.is_developer() or (public.is_admin() and not public.is_developer_user(employee_id)))
  with check (public.is_developer() or (public.is_admin() and not public.is_developer_user(employee_id)));
