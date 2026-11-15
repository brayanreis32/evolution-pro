// Gera o link_token para abrir a janela do Plaid no app.
import { handler, json, plaid, requireAdmin } from "../_shared/common.ts";

Deno.serve(handler(async (req) => {
  const userId = await requireAdmin(req);
  const { language } = await req.json().catch(() => ({}));
  const data = await plaid("/link/token/create", {
    user: { client_user_id: userId },
    client_name: "Evolution Pro",
    products: ["transactions"],
    transactions: { days_requested: 730 },
    country_codes: ["US"],
    language: language === "pt" ? "en" : (language ?? "en"), // Plaid não tem PT nos EUA
  });
  return json({ link_token: data.link_token });
}));
