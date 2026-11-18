// Gera o link_token para abrir a janela do Plaid no app.
// - Nome mostrado ao cliente = nome da empresa cadastrado no sistema
//   (a mesma conta Plaid pode atender vários sistemas/clientes)
// - Webhook: o Plaid avisa quando há lançamentos novos (sincroniza sozinho)
// - redirect_uri (opcional, PLAID_REDIRECT_URI): bancos OAuth no celular
import { requireMfa, handler, json, plaid, requireAdmin, serviceClient } from "../_shared/common.ts";

Deno.serve(handler(async (req) => {
  const userId = await requireAdmin(req);
  await requireMfa(userId);
  const { language } = await req.json().catch(() => ({}));

  const db = serviceClient();
  const { data: company } = await db.from("company_settings").select("name").eq("id", 1).maybeSingle();
  const clientName = (company?.name || "Business").slice(0, 30); // limite do Plaid: 30 caracteres

  const body: Record<string, unknown> = {
    user: { client_user_id: userId },
    client_name: clientName,
    products: ["transactions"],
    transactions: { days_requested: 730 },
    country_codes: ["US"],
    language: language === "pt" ? "en" : (language ?? "en"), // Plaid não tem PT nos EUA
    webhook: `${Deno.env.get("SUPABASE_URL")}/functions/v1/plaid-webhook`,
  };
  const redirect = Deno.env.get("PLAID_REDIRECT_URI");
  if (redirect) body.redirect_uri = redirect;

  const data = await plaid("/link/token/create", body);
  return json({ link_token: data.link_token });
}));
