-- Papel "developer": acesso total e invisível para os administradores.
-- (valor do enum em migração separada: precisa ser confirmado antes de ser usado)
alter type public.user_role add value if not exists 'developer';
