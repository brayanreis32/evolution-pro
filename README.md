# Evolution Pro

Sistema de gestão da **Evolution Pro Carpentry Inc** (410 Norfolk St, Holliston, MA 01746 · André Bento · (781) 731-2486 · evolutionprocarpentry@gmail.com), que funciona no computador e no celular (instala como app):

- **Financeiro:** entradas e saídas, conexão com o banco (Plaid), categorias e exportação para CSV.
- **Invoices:** profissionais, com a sua logo e numeração automática, e saem em PDF (EN ou PT). Quando você marca um invoice como pago, o valor entra sozinho no Financeiro.
- **Equipe:** cadastro de funcionários e valor por hora.
- **Ponto no celular:** entrada, pausa, volta e saída. **Só funciona dentro do raio do local de trabalho** em que o funcionário está escalado naquele dia.
- **Horas / folha:** horas por funcionário no período, valor a pagar, correção de batidas e lançamento do pagamento no Financeiro.
- **Bilíngue:** PT/EN. Cada pessoa escolhe o idioma, e cada invoice tem o seu.

## Como funciona

| Parte | Tecnologia |
|---|---|
| Banco de dados e regras | PostgreSQL no **Supabase**, regras em **PL/pgSQL** (`supabase/migrations`) |
| Login e segurança | Supabase Auth + Row Level Security (funcionário só vê o que é dele) |
| Banco (EUA) | **Plaid**, via Edge Functions (`supabase/functions`) |
| App | React + Vite + Tailwind (`web/`), PWA |

O **ponto** é validado **no servidor** (função `punch()`). O funcionário só consegue bater o ponto se:

1. estiver escalado num local naquele dia (tela **Locais**, botão **Escalar**);
2. estiver dentro do raio do local (padrão: 150 m);
3. o GPS estiver preciso (padrão: até 100 m de erro);
4. a sequência fizer sentido (entrada → pausa → volta → saída).

Pausa e saída precisam ser feitas no mesmo local da entrada.

## Instalação (uma vez)

### 1. Supabase
1. Crie um projeto em https://supabase.com.
2. Em **SQL Editor**, cole e rode o arquivo `supabase/migrations/20261115000000_init.sql`.
   Se preferir, use a CLI: `supabase link` e depois `supabase db push`.
3. Em **Authentication → Sign In / Providers**, desligue **Allow new users to sign up**. Só você cadastra a equipe.
4. Em **Authentication → Users → Add user**, crie o **seu** usuário. **O primeiro usuário vira administrador.**

### 2. Edge Functions (cadastro de funcionário e Plaid)
```bash
supabase functions deploy create-employee plaid-link-token plaid-exchange plaid-sync
supabase secrets set PLAID_CLIENT_ID=... PLAID_SECRET=... PLAID_ENV=sandbox
# opcional, para sincronizar o banco automaticamente por agendamento:
supabase secrets set CRON_SECRET=uma-senha-qualquer
```
- **Plaid:** crie a conta em https://dashboard.plaid.com. Teste com `PLAID_ENV=sandbox` (usuário `user_good`, senha `pass_good`). Para os bancos reais, peça acesso de **Production** e troque para `PLAID_ENV=production`.

### 3. App (web)
```bash
cd web
cp .env.example .env     # preencha a URL e a anon key do Supabase
npm install
npm run dev              # teste local em http://localhost:5173
npm run build            # gera a pasta dist/
```
Para publicar, use a **Vercel** (Root Directory: `web`) ou a Netlify, com as mesmas variáveis do `.env`.

### 4. Celular
Abra o endereço do sistema no celular e use **Compartilhar → Adicionar à Tela de Início** (iPhone) ou **Instalar app** (Android). O funcionário precisa **permitir a localização**.

## Primeiros passos no sistema
1. **Empresa:** envie a logo e preencha endereço, EIN e as instruções de pagamento (Zelle, cheque…).
2. **Equipe:** cadastre os funcionários (e-mail, senha inicial e valor por hora).
3. **Locais:** crie o local da obra (busque o endereço ou use sua localização), ajuste o raio e escale a equipe na semana.
4. **Clientes:** cadastre a empresa de carpintaria.
5. **Invoices:** crie um invoice, adicione os itens e use **Ver / imprimir** para salvar o PDF.
6. **Financeiro:** use **Conectar banco** e confira as categorias.

## Observações
- Nenhum GPS de celular é 100% à prova de fraude: existem apps que falsificam a localização. Toda batida guarda as coordenadas, a precisão e a distância, e a tela **Horas** mostra o link do mapa de cada batida.
- Se o funcionário esquecer de bater a saída, o turno fica **em aberto** e não entra na folha. Corrija em **Horas → Detalhes → Adicionar batida**.
