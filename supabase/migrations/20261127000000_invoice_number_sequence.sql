-- Número do invoice editável (migração de outro sistema): ao salvar um número
-- com o prefixo da empresa (ex.: INV-2450), a sequência continua a partir dele.
create or replace function public.invoice_number_follow()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_prefix text;
  v_num    bigint;
begin
  if new.number is null then return new; end if;
  new.number := btrim(new.number);
  select invoice_prefix into v_prefix from public.company_settings where id = 1;
  -- só o número puro ou PREFIXO+número entram na sequência
  if new.number ~ '^[0-9]+$' then
    v_num := new.number::bigint;
  elsif v_prefix is not null and left(new.number, length(v_prefix)) = v_prefix
        and substr(new.number, length(v_prefix) + 1) ~ '^[0-9]+$' then
    v_num := substr(new.number, length(v_prefix) + 1)::bigint;
  end if;
  if v_num is not null and v_num < 2000000000 then
    update public.company_settings
       set next_invoice_number = greatest(next_invoice_number, v_num + 1)
     where id = 1;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_number_follow on public.invoices;
create trigger invoices_number_follow
  before insert or update of number on public.invoices
  for each row execute function public.invoice_number_follow();
revoke execute on function public.invoice_number_follow() from public, anon, authenticated;
