// Depois que você conecta o banco no Plaid: troca o public_token pelo
// access_token (guardado no schema privado) e faz a primeira sincronização.
import { requireMfa, handler, json, plaid, requireAdmin, serviceClient, syncItem } from "../_shared/common.ts";

Deno.serve(handler(async (req) => {
  await requireAdmin(req);
  requireMfa(req); // já validado pelo requireAdmin (getUser); aqui só confere o nível
  const { public_token, institution_name } = await req.json();
  const ex = await plaid("/item/public_token/exchange", { public_token });

  const db = serviceClient();
  await db.from("plaid_items").upsert(
    { item_id: ex.item_id, institution_name: institution_name ?? null },
    { onConflict: "item_id" },
  );
  await db.rpc("plaid_save_token", { p_item_id: ex.item_id, p_access_token: ex.access_token });

  const result = await syncItem(db, ex.item_id, ex.access_token, null);
  return json({ ok: true, ...result });
}));
