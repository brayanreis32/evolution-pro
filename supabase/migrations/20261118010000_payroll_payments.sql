-- =====================================================================
-- Pagamento da folha: Zelle do funcionário, pagamentos registrados por
-- período (sem pagar duas vezes) e lançamento automático no financeiro.
-- =====================================================================

alter table public.profiles add column if not exists zelle_contact text; -- e-mail ou telefone do Zelle
alter table public.profiles add column if not exists zelle_name text;    -- nome que aparece no Zelle

create table if not exists public.payroll_payments (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.profiles (id) on delete restrict,
  period_start   date not null,
  period_end     date not null,
  hours          numeric(10,2) not null,
  hourly_rate    numeric(10,2) not null,
  gross          numeric(14,2) not null,          -- horas × valor/hora
  adjustment     numeric(14,2) not null default 0, -- bônus (+) ou desconto (−)
  amount         numeric(14,2) not null,           -- valor pago
  method         text not null default 'zelle' check (method in ('zelle', 'cash', 'check', 'transfer', 'other')),
  reference      text,                              -- nº de confirmação do Zelle, nº do cheque…
  note           text,
  paid_at        timestamptz not null default now(),
  paid_by        uuid references public.profiles (id),
  transaction_id uuid references public.transactions (id) on delete set null,
  check (period_end >= period_start),
  unique (employee_id, period_start, period_end)
);
create index if not exists payroll_payments_emp on public.payroll_payments (employee_id, period_start);

alter table public.payroll_payments enable row level security;
drop policy if exists payroll_payments_select on public.payroll_payments;
create policy payroll_payments_select on public.payroll_payments for select
  using (employee_id = auth.uid()
         or public.is_developer()
         or (public.is_admin() and not public.is_developer_user(employee_id)));
-- escrita só pelas funções abaixo (security definer)

-- Paga um funcionário por um período:
--  * recalcula as horas no servidor (não confia no valor da tela)
--  * recusa se houver ponto em aberto no período ou se já foi pago
--  * lança a saída no financeiro (Folha de pagamento) e liga as duas coisas
create or replace function public.pay_employee(
  p_employee   uuid,
  p_start      date,
  p_end        date,
  p_method     text default 'zelle',
  p_reference  text default null,
  p_adjustment numeric default 0,
  p_note       text default null
)
returns public.payroll_payments
language plpgsql security definer set search_path = public
as $$
declare
  v_emp     public.profiles;
  v_minutes numeric;
  v_open    int;
  v_hours   numeric;
  v_gross   numeric;
  v_amount  numeric;
  v_cat     uuid;
  v_txn     uuid;
  v_row     public.payroll_payments;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;

  select * into v_emp from public.profiles where id = p_employee;
  if v_emp.id is null or (v_emp.role = 'developer' and not public.is_developer()) then
    raise exception 'NOT_FOUND';
  end if;

  if exists (select 1 from public.payroll_payments
              where employee_id = p_employee and period_start = p_start and period_end = p_end) then
    raise exception 'ALREADY_PAID';
  end if;

  select coalesce(sum(worked_minutes) filter (where not is_open), 0), count(*) filter (where is_open)
    into v_minutes, v_open
    from public.work_sessions(p_start, p_end, p_employee);
  if v_open > 0 then raise exception 'OPEN_SHIFTS'; end if;

  v_hours  := round(v_minutes / 60, 2);
  v_gross  := round(v_minutes / 60 * v_emp.hourly_rate, 2);
  v_amount := v_gross + coalesce(p_adjustment, 0);
  if v_amount <= 0 then raise exception 'NOTHING_TO_PAY'; end if;

  select id into v_cat from public.categories where name = 'Folha de pagamento' and kind = 'expense';

  insert into public.transactions (txn_date, description, amount, kind, category_id, source, notes)
  values (
    (now() at time zone public.company_tz())::date,
    'Folha de pagamento — ' || v_emp.full_name || ' (' || to_char(p_start, 'MM/DD') || '–' || to_char(p_end, 'MM/DD/YYYY') || ', ' || v_hours || 'h)',
    v_amount, 'expense', v_cat, 'manual',
    nullif(concat_ws(' · ', upper(p_method), p_reference, p_note), '')
  )
  returning id into v_txn;

  insert into public.payroll_payments
    (employee_id, period_start, period_end, hours, hourly_rate, gross, adjustment, amount,
     method, reference, note, paid_by, transaction_id)
  values
    (p_employee, p_start, p_end, v_hours, v_emp.hourly_rate, v_gross, coalesce(p_adjustment, 0), v_amount,
     coalesce(p_method, 'zelle'), nullif(p_reference, ''), nullif(p_note, ''), auth.uid(), v_txn)
  returning * into v_row;

  return v_row;
end;
$$;

-- Desfaz um pagamento lançado por engano (apaga também a saída no financeiro)
create or replace function public.undo_payroll_payment(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.payroll_payments;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  select * into v_row from public.payroll_payments where id = p_id;
  if v_row.id is null or (public.is_developer_user(v_row.employee_id) and not public.is_developer()) then
    raise exception 'NOT_FOUND';
  end if;
  delete from public.payroll_payments where id = p_id;
  if v_row.transaction_id is not null then
    delete from public.transactions where id = v_row.transaction_id;
  end if;
end;
$$;

revoke execute on function public.pay_employee(uuid, date, date, text, text, numeric, text) from public, anon;
revoke execute on function public.undo_payroll_payment(uuid) from public, anon;
grant execute on function public.pay_employee(uuid, date, date, text, text, numeric, text) to authenticated;
grant execute on function public.undo_payroll_payment(uuid) to authenticated;

-- ao vivo: funcionário vê "Pago" na hora
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.payroll_payments;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;
