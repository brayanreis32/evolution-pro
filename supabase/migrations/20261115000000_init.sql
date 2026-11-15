-- =====================================================================
-- Evolution Pro — esquema inicial
-- Contabilidade (entradas/saídas + Plaid), invoices, equipe e ponto
-- com geolocalização. Regras de negócio em PL/pgSQL.
-- =====================================================================

create extension if not exists pgcrypto;

create schema if not exists private;   -- dados que o app nunca lê (tokens do Plaid)
revoke all on schema private from public;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.user_role      as enum ('admin', 'employee');
create type public.punch_type     as enum ('clock_in', 'break_start', 'break_end', 'clock_out');
create type public.txn_kind       as enum ('income', 'expense');
create type public.invoice_status as enum ('draft', 'sent', 'paid', 'void');

-- ---------------------------------------------------------------------
-- Usuários / funcionários
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  email       text,
  phone       text,
  role        public.user_role not null default 'employee',
  hourly_rate numeric(10,2) not null default 0 check (hourly_rate >= 0),
  language    text not null default 'pt' check (language in ('pt', 'en')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

-- Cria o perfil automaticamente. O PRIMEIRO usuário do sistema vira admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.user_role := 'employee';
begin
  if not exists (select 1 from public.profiles) then
    v_role := 'admin';
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- O próprio usuário só pode mudar o idioma e o telefone.
create or replace function public.update_my_profile(p_language text, p_phone text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.profiles
     set language = coalesce(p_language, language),
         phone    = coalesce(p_phone, phone)
   where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------
-- Dados da empresa (uma linha só)
-- ---------------------------------------------------------------------
create table public.company_settings (
  id                   int primary key default 1 check (id = 1),
  name                 text not null default 'Evolution Pro Carpentry Inc',
  tagline              text default 'Professional Carpenters · Siding · Decks · Doors and Windows',
  owner_name           text default 'André Bento',
  address              text,
  city                 text,
  state                text,
  zip                  text,
  phone                text,
  email                text,
  website              text,
  tax_id               text,
  logo_url             text default '/brand/logo-light.svg',
  brand_color          text not null default '#2b3d2f',
  accent_color         text not null default '#7ed957',
  timezone             text not null default 'America/New_York',
  currency             text not null default 'USD',
  invoice_prefix       text not null default 'INV-',
  next_invoice_number  int  not null default 1001,
  payment_terms_days   int  not null default 15,
  invoice_notes        text default 'Thank you for your business!',
  payment_instructions text,
  max_gps_accuracy_m   int  not null default 100 check (max_gps_accuracy_m between 10 and 1000),
  updated_at           timestamptz not null default now()
);
insert into public.company_settings (id, name, address, city, state, zip, phone, email)
values (1, 'Evolution Pro Carpentry Inc', '410 Norfolk St', 'Holliston', 'MA', '01746',
        '(781) 731-2486', 'evolutionprocarpentry@gmail.com');

create or replace function public.company_tz()
returns text language sql stable security definer set search_path = public
as $$ select timezone from public.company_settings where id = 1 $$;

-- ---------------------------------------------------------------------
-- Locais de trabalho e escala
-- ---------------------------------------------------------------------
create table public.job_sites (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text not null,
  latitude   double precision not null check (latitude between -90 and 90),
  longitude  double precision not null check (longitude between -180 and 180),
  radius_m   int not null default 150 check (radius_m between 25 and 2000),
  active     boolean not null default true,
  notes      text,
  created_at timestamptz not null default now()
);

-- "Essa semana o funcionário X trabalha no local Y"
create table public.site_assignments (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.job_sites (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);
create index on public.site_assignments (employee_id, start_date, end_date);

-- ---------------------------------------------------------------------
-- Ponto
-- ---------------------------------------------------------------------
create table public.time_punches (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  site_id     uuid references public.job_sites (id) on delete set null,
  punch       public.punch_type not null,
  punched_at  timestamptz not null default now(),
  latitude    double precision,
  longitude   double precision,
  accuracy_m  double precision,
  distance_m  double precision,
  edited_by   uuid references public.profiles (id),  -- preenchido quando o admin corrige
  note        text,
  created_at  timestamptz not null default now()
);
create index on public.time_punches (employee_id, punched_at);

-- Distância em metros entre dois pontos (fórmula de haversine)
create or replace function public.distance_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable
as $$
  select 2 * 6371000 * asin(sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2) +
           cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
         ));
$$;

-- Último registro do turno em andamento (null se não está trabalhando)
create or replace function public.current_punch(p_employee uuid)
returns public.time_punches
language sql stable security definer set search_path = public
as $$
  select * from public.time_punches
   where employee_id = p_employee
   order by punched_at desc
   limit 1;
$$;

-- Locais em que o funcionário pode bater ponto hoje
create or replace function public.my_sites_today()
returns setof public.job_sites
language sql stable security definer set search_path = public
as $$
  select s.*
    from public.job_sites s
    join public.site_assignments a on a.site_id = s.id
   where a.employee_id = auth.uid()
     and s.active
     and (now() at time zone public.company_tz())::date between a.start_date and a.end_date;
$$;

-- Bater ponto. TODA a validação acontece aqui no servidor:
--  * o funcionário precisa ter um local escalado para hoje
--  * precisa estar dentro do raio do local (e com GPS preciso)
--  * a sequência tem que fazer sentido (entrada -> pausa -> volta -> saída)
-- Erros voltam com um código que o app traduz (PT/EN).
create or replace function public.punch(
  p_type     public.punch_type,
  p_lat      float8,
  p_lng      float8,
  p_accuracy float8
)
returns public.time_punches
language plpgsql security definer set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_last     public.time_punches;
  v_site     public.job_sites;
  v_dist     float8;
  v_max_acc  int;
  v_row      public.time_punches;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid and active) then
    raise exception 'INACTIVE_USER';
  end if;

  if p_lat is null or p_lng is null then
    raise exception 'NO_LOCATION';
  end if;

  select max_gps_accuracy_m into v_max_acc from public.company_settings where id = 1;
  if p_accuracy is null or p_accuracy > v_max_acc then
    raise exception 'LOW_ACCURACY:%', round(coalesce(p_accuracy, -1));
  end if;

  -- trava as batidas do funcionário para evitar duplo clique simultâneo
  perform pg_advisory_xact_lock(hashtext(v_uid::text));

  v_last := public.current_punch(v_uid);

  -- sequência válida
  if p_type = 'clock_in' and v_last.punch is not null and v_last.punch <> 'clock_out' then
    raise exception 'ALREADY_CLOCKED_IN';
  elsif p_type in ('break_start', 'clock_out')
        and (v_last.punch is null or v_last.punch not in ('clock_in', 'break_end')) then
    raise exception '%', case when v_last.punch = 'break_start' then 'ON_BREAK' else 'NOT_CLOCKED_IN' end;
  elsif p_type = 'break_end' and (v_last.punch is distinct from 'break_start') then
    raise exception 'NOT_ON_BREAK';
  end if;

  if p_type = 'clock_in' then
    -- local escalado hoje mais próximo
    select s.* into v_site
      from public.my_sites_today() s
     order by public.distance_m(p_lat, p_lng, s.latitude, s.longitude)
     limit 1;
  else
    -- pausa/saída: tem que ser no mesmo local da entrada
    select s.* into v_site from public.job_sites s where s.id = v_last.site_id;
  end if;

  if v_site.id is null then
    raise exception 'NO_SITE_TODAY';
  end if;

  v_dist := public.distance_m(p_lat, p_lng, v_site.latitude, v_site.longitude);
  if v_dist > v_site.radius_m then
    raise exception 'OUT_OF_RANGE:%:%', round(v_dist), v_site.radius_m;
  end if;

  insert into public.time_punches (employee_id, site_id, punch, latitude, longitude, accuracy_m, distance_m)
  values (v_uid, v_site.id, p_type, p_lat, p_lng, p_accuracy, v_dist)
  returning * into v_row;

  return v_row;
end;
$$;

-- Turnos de trabalho montados a partir das batidas.
-- Turno aberto (sem saída) é contado até agora e marcado is_open.
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

-- Folha de pagamento do período: horas x valor/hora
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
     and ((p.active and p.role = 'employee') or s.clock_in is not null)
   group by p.id, p.full_name, p.hourly_rate
   order by p.full_name;
$$;

-- ---------------------------------------------------------------------
-- Contabilidade
-- ---------------------------------------------------------------------
create table public.plaid_items (
  id               uuid primary key default gen_random_uuid(),
  item_id          text not null unique,
  institution_name text,
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now()
);

-- access_token + cursor: só as Edge Functions (service role) leem
create table private.plaid_tokens (
  item_id      text primary key references public.plaid_items (item_id) on delete cascade,
  access_token text not null,
  cursor       text
);

create table public.bank_accounts (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  institution       text,
  mask              text,
  account_type      text,
  plaid_item_id     uuid references public.plaid_items (id) on delete set null,
  plaid_account_id  text unique,
  current_balance   numeric(14,2),
  available_balance numeric(14,2),
  currency          text not null default 'USD',
  updated_at        timestamptz not null default now()
);

create table public.categories (
  id    uuid primary key default gen_random_uuid(),
  name  text not null,
  kind  public.txn_kind not null,
  color text not null default '#64748b',
  unique (name, kind)
);
insert into public.categories (name, kind, color) values
  ('Serviços / Invoices', 'income',  '#16a34a'),
  ('Outras entradas',     'income',  '#22c55e'),
  ('Folha de pagamento',  'expense', '#dc2626'),
  ('Material',            'expense', '#ea580c'),
  ('Ferramentas',         'expense', '#d97706'),
  ('Combustível',         'expense', '#ca8a04'),
  ('Veículo',             'expense', '#9333ea'),
  ('Seguro',              'expense', '#2563eb'),
  ('Impostos',            'expense', '#475569'),
  ('Alimentação',         'expense', '#db2777'),
  ('Outras despesas',     'expense', '#64748b');

create table public.transactions (
  id                   uuid primary key default gen_random_uuid(),
  account_id           uuid references public.bank_accounts (id) on delete set null,
  txn_date             date not null default current_date,
  description          text not null,
  amount               numeric(14,2) not null check (amount >= 0),
  kind                 public.txn_kind not null,
  category_id          uuid references public.categories (id) on delete set null,
  source               text not null default 'manual' check (source in ('manual', 'plaid', 'invoice')),
  plaid_transaction_id text unique,
  invoice_id           uuid,
  pending              boolean not null default false,
  notes                text,
  created_at           timestamptz not null default now()
);
create index on public.transactions (txn_date);

-- Totais do período
create or replace function public.finance_summary(p_start date, p_end date)
returns table (income numeric, expense numeric, net numeric)
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(amount) filter (where kind = 'income'), 0),
         coalesce(sum(amount) filter (where kind = 'expense'), 0),
         coalesce(sum(case when kind = 'income' then amount else -amount end), 0)
    from public.transactions
   where public.is_admin() and txn_date between p_start and p_end;
$$;

-- Totais por categoria
create or replace function public.finance_by_category(p_start date, p_end date)
returns table (category_id uuid, name text, color text, kind public.txn_kind, total numeric)
language sql stable security definer set search_path = public
as $$
  select c.id, coalesce(c.name, 'Sem categoria'), coalesce(c.color, '#94a3b8'), t.kind, sum(t.amount)
    from public.transactions t
    left join public.categories c on c.id = t.category_id
   where public.is_admin() and t.txn_date between p_start and p_end
   group by c.id, c.name, c.color, t.kind
   order by sum(t.amount) desc;
$$;

-- ---------------------------------------------------------------------
-- Clientes e invoices
-- ---------------------------------------------------------------------
create table public.clients (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  contact_name text,
  email        text,
  phone        text,
  address      text,
  city         text,
  state        text,
  zip          text,
  notes        text,
  created_at   timestamptz not null default now()
);

-- primeiro cliente (outros são cadastrados pela tela Clientes)
insert into public.clients (name, email, address, city, state, zip)
values ('Quintão Construction Corp', 'contact@quintaoconstruction.com',
        '135 Granite St', 'Leominster', 'MA', '01453');

create table public.invoices (
  id          uuid primary key default gen_random_uuid(),
  number      text unique,
  client_id   uuid not null references public.clients (id),
  site_id     uuid references public.job_sites (id) on delete set null,
  job_address text,
  po_number   text,
  issue_date  date not null default current_date,
  due_date    date,
  status      public.invoice_status not null default 'draft',
  language    text not null default 'en' check (language in ('pt', 'en')),
  tax_rate    numeric(6,3) not null default 0 check (tax_rate >= 0),
  discount    numeric(14,2) not null default 0 check (discount >= 0),
  subtotal    numeric(14,2) not null default 0,
  tax_amount  numeric(14,2) not null default 0,
  total       numeric(14,2) not null default 0,
  notes       text,
  paid_at     date,
  created_at  timestamptz not null default now()
);

alter table public.transactions
  add constraint transactions_invoice_fk
  foreign key (invoice_id) references public.invoices (id) on delete set null;

create table public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices (id) on delete cascade,
  position    int not null default 0,
  description text not null,
  quantity    numeric(12,2) not null default 1,
  unit        text,
  unit_price  numeric(14,2) not null default 0,
  amount      numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored
);
create index on public.invoice_items (invoice_id, position);

-- Número sequencial e vencimento automáticos
create or replace function public.invoice_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg public.company_settings;
begin
  select * into v_cfg from public.company_settings where id = 1 for update;
  if new.number is null or new.number = '' then
    new.number := v_cfg.invoice_prefix || v_cfg.next_invoice_number;
    update public.company_settings
       set next_invoice_number = next_invoice_number + 1
     where id = 1;
  end if;
  if new.due_date is null then
    new.due_date := new.issue_date + v_cfg.payment_terms_days;
  end if;
  return new;
end;
$$;

create trigger invoices_before_insert
  before insert on public.invoices
  for each row execute function public.invoice_before_insert();

-- Recalcula subtotal / imposto / total
create or replace function public.recalc_invoice(p_invoice uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_sub numeric;
begin
  select coalesce(sum(amount), 0) into v_sub from public.invoice_items where invoice_id = p_invoice;
  update public.invoices i
     set subtotal   = v_sub,
         tax_amount = round(greatest(v_sub - i.discount, 0) * i.tax_rate / 100, 2),
         total      = greatest(v_sub - i.discount, 0)
                      + round(greatest(v_sub - i.discount, 0) * i.tax_rate / 100, 2)
   where i.id = p_invoice;
end;
$$;

create or replace function public.invoice_items_changed()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.recalc_invoice(coalesce(new.invoice_id, old.invoice_id));
  if tg_op = 'UPDATE' and new.invoice_id <> old.invoice_id then
    perform public.recalc_invoice(old.invoice_id);
  end if;
  return null;
end;
$$;

create trigger invoice_items_recalc
  after insert or update or delete on public.invoice_items
  for each row execute function public.invoice_items_changed();

create or replace function public.invoice_after_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.tax_rate is distinct from old.tax_rate or new.discount is distinct from old.discount then
    perform public.recalc_invoice(new.id);
  end if;
  return null;
end;
$$;

create trigger invoices_after_update
  after update of tax_rate, discount on public.invoices
  for each row execute function public.invoice_after_update();

-- Invoice marcado como pago => entra na contabilidade automaticamente
-- (se depois voltar de "pago", o lançamento automático é removido)
create or replace function public.invoice_paid_sync()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_client text;
  v_cat    uuid;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    new.paid_at := coalesce(new.paid_at, current_date);
    select name into v_client from public.clients where id = new.client_id;
    select id into v_cat from public.categories where name = 'Serviços / Invoices' and kind = 'income';
    insert into public.transactions (txn_date, description, amount, kind, category_id, source, invoice_id)
    values (new.paid_at, 'Invoice ' || new.number || ' — ' || coalesce(v_client, ''),
            new.total, 'income', v_cat, 'invoice', new.id);
  elsif old.status = 'paid' and new.status <> 'paid' then
    delete from public.transactions where invoice_id = new.id and source = 'invoice';
    new.paid_at := null;
  end if;
  return new;
end;
$$;

create trigger invoices_paid_sync
  before update of status on public.invoices
  for each row execute function public.invoice_paid_sync();

-- ---------------------------------------------------------------------
-- Segurança (Row Level Security)
-- Admin vê tudo. Funcionário só vê o próprio perfil, a própria escala,
-- os locais onde foi escalado e as próprias batidas.
-- ---------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.company_settings enable row level security;
alter table public.job_sites        enable row level security;
alter table public.site_assignments enable row level security;
alter table public.time_punches     enable row level security;
alter table public.plaid_items      enable row level security;
alter table public.bank_accounts    enable row level security;
alter table public.categories       enable row level security;
alter table public.transactions     enable row level security;
alter table public.clients          enable row level security;
alter table public.invoices         enable row level security;
alter table public.invoice_items    enable row level security;

create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy profiles_admin_write on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

create policy company_select on public.company_settings for select
  using (auth.uid() is not null);
create policy company_admin on public.company_settings for update
  using (public.is_admin()) with check (public.is_admin());

create policy sites_select on public.job_sites for select
  using (public.is_admin() or exists (
    select 1 from public.site_assignments a
     where a.site_id = job_sites.id and a.employee_id = auth.uid()));
create policy sites_admin on public.job_sites for all
  using (public.is_admin()) with check (public.is_admin());

create policy assign_select on public.site_assignments for select
  using (employee_id = auth.uid() or public.is_admin());
create policy assign_admin on public.site_assignments for all
  using (public.is_admin()) with check (public.is_admin());

-- funcionário NÃO insere direto: só pela função punch() que valida o local
create policy punches_select on public.time_punches for select
  using (employee_id = auth.uid() or public.is_admin());
create policy punches_admin on public.time_punches for all
  using (public.is_admin()) with check (public.is_admin());

create policy plaid_items_admin   on public.plaid_items   for all using (public.is_admin()) with check (public.is_admin());
create policy bank_accounts_admin on public.bank_accounts for all using (public.is_admin()) with check (public.is_admin());
create policy categories_admin    on public.categories    for all using (public.is_admin()) with check (public.is_admin());
create policy transactions_admin  on public.transactions  for all using (public.is_admin()) with check (public.is_admin());
create policy clients_admin       on public.clients       for all using (public.is_admin()) with check (public.is_admin());
create policy invoices_admin      on public.invoices      for all using (public.is_admin()) with check (public.is_admin());
create policy invoice_items_admin on public.invoice_items for all using (public.is_admin()) with check (public.is_admin());

-- funções que o app chama
revoke execute on function public.handle_new_user()       from public, anon, authenticated;
revoke execute on function public.invoice_before_insert() from public, anon, authenticated;
grant execute on function public.punch(public.punch_type, float8, float8, float8) to authenticated;
grant execute on function public.work_sessions(date, date, uuid)  to authenticated;
grant execute on function public.payroll_summary(date, date)      to authenticated;
grant execute on function public.finance_summary(date, date)      to authenticated;
grant execute on function public.finance_by_category(date, date)  to authenticated;
grant execute on function public.my_sites_today()                 to authenticated;
grant execute on function public.update_my_profile(text, text)    to authenticated;

-- ---------------------------------------------------------------------
-- Storage: bucket público para a logo (só admin envia)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('branding', 'branding', true)
      on conflict (id) do nothing;

    execute $p$ create policy branding_read on storage.objects for select
                using (bucket_id = 'branding') $p$;
    execute $p$ create policy branding_admin_insert on storage.objects for insert
                with check (bucket_id = 'branding' and public.is_admin()) $p$;
    execute $p$ create policy branding_admin_update on storage.objects for update
                using (bucket_id = 'branding' and public.is_admin()) $p$;
    execute $p$ create policy branding_admin_delete on storage.objects for delete
                using (bucket_id = 'branding' and public.is_admin()) $p$;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Acesso aos tokens do Plaid (só Edge Functions com service_role)
-- ---------------------------------------------------------------------
create or replace function public.plaid_save_token(p_item_id text, p_access_token text)
returns void language sql security definer set search_path = public, private
as $$
  insert into private.plaid_tokens (item_id, access_token) values (p_item_id, p_access_token)
  on conflict (item_id) do update set access_token = excluded.access_token;
$$;

create or replace function public.plaid_tokens_list()
returns table (item_id text, access_token text, cursor text)
language sql security definer set search_path = public, private
as $$ select item_id, access_token, cursor from private.plaid_tokens $$;

create or replace function public.plaid_set_cursor(p_item_id text, p_cursor text)
returns void language sql security definer set search_path = public, private
as $$
  update private.plaid_tokens set cursor = p_cursor where item_id = p_item_id;
  update public.plaid_items set last_synced_at = now() where item_id = p_item_id;
$$;

revoke execute on function public.plaid_save_token(text, text) from public, anon, authenticated;
revoke execute on function public.plaid_tokens_list()          from public, anon, authenticated;
revoke execute on function public.plaid_set_cursor(text, text) from public, anon, authenticated;
grant  execute on function public.plaid_save_token(text, text) to service_role;
grant  execute on function public.plaid_tokens_list()          to service_role;
grant  execute on function public.plaid_set_cursor(text, text) to service_role;
