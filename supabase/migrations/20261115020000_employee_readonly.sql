-- Funcionário só pode trocar o idioma da própria tela (nada mais).
create or replace function public.update_my_profile(p_language text, p_phone text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_language in ('pt', 'en') then
    update public.profiles set language = p_language where id = auth.uid();
  end if;
end;
$$;

-- Escala do funcionário: hoje e os próximos dias (para ele saber onde vai trabalhar)
create or replace function public.my_schedule(p_days int default 14)
returns table (start_date date, end_date date, site_name text, address text, latitude float8, longitude float8)
language sql stable security definer set search_path = public
as $$
  select a.start_date, a.end_date, s.name, s.address, s.latitude, s.longitude
    from public.site_assignments a
    join public.job_sites s on s.id = a.site_id
   where a.employee_id = auth.uid()
     and s.active
     and a.end_date   >= (now() at time zone public.company_tz())::date
     and a.start_date <= (now() at time zone public.company_tz())::date + least(greatest(p_days, 1), 60)
   order by a.start_date;
$$;
grant execute on function public.my_schedule(int) to authenticated;
