// Puxa as transações novas de todos os bancos conectados.
// Pode ser chamado pelo botão "Sincronizar" ou por um agendamento (cron).
import { handler, json, requireAdmin, serviceClient, syncItem, HttpError } from "../_shared/common.ts";

Deno.serve(handler(async (req) => {
  // agendamento usa o header x-cron-secret; usuário usa o login de admin
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!(cronSecret && req.headers.get("x-cron-secret") === cronSecret)) {
    await requireAdmin(req);
  }
  const db = serviceClient();
  const { data: tokens, error } = await db.rpc("plaid_tokens_list");
  if (error) throw new HttpError(500, error.message);

  const results = [];
  for (const t of tokens ?? []) {
    try {
      results.push({ item_id: t.item_id, ...(await syncItem(db, t.item_id, t.access_token, t.cursor)) });
    } catch (e) {
      results.push({ item_id: t.item_id, error: (e as Error).message });
    }
  }
  return json({ ok: true, results });
}));
