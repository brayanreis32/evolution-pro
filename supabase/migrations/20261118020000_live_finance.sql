-- Financeiro ao vivo: lançamentos e saldos aparecem sozinhos na tela
-- (Realtime respeita a RLS: só administradores recebem esses dados).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.transactions;  exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.bank_accounts; exception when duplicate_object then null; end;
  end if;
end;
$$;
