// Desconecta um banco: encerra o acesso no Plaid e apaga as contas e os
// lançamentos que vieram dele. Lançamentos manuais e de invoices ficam.
import { requireMfa, handler, json, plaid, requireAdmin, serviceClient, HttpError } from "../_shared/common.ts";

Deno.serve(handler(async (req) => {
  const userId = await requireAdmin(req);
  await requireMfa(userId);
  const { plaid_item_id } = await req.json(); // id (uuid) da tabela plaid_items
  if (!plaid_item_id) throw new HttpError(400, "MISSING_FIELDS");

  const db = serviceClient();
  const { data: item } = await db.from("plaid_items").select("id, item_id").eq("id", plaid_item_id).maybeSingle();
  if (!item) throw new HttpError(404, "NOT_FOUND");

  // 1) encerra o acesso no Plaid (se falhar, apaga localmente do mesmo jeito)
  let plaidRemoved = true;
  const { data: tokens } = await db.rpc("plaid_tokens_list");
  const token = (tokens ?? []).find((t: any) => t.item_id === item.item_id);
  if (token) {
    try { await plaid("/item/remove", { access_token: token.access_token }); }
    catch (e) { plaidRemoved = false; console.error("item/remove failed", e); }
  }

  // 2) apaga lançamentos e contas desse banco
  const { data: accounts } = await db.from("bank_accounts").select("id").eq("plaid_item_id", item.id);
  const accountIds = (accounts ?? []).map((a) => a.id);
  let deletedTxns = 0;
  if (accountIds.length) {
    const { count } = await db.from("transactions").delete({ count: "exact" }).in("account_id", accountIds).eq("source", "plaid");
    deletedTxns = count ?? 0;
    await db.from("bank_accounts").delete().in("id", accountIds);
  }
  await db.from("plaid_items").delete().eq("id", item.id); // token privado sai junto (cascade)

  return json({ ok: true, plaidRemoved, deletedAccounts: accountIds.length, deletedTxns });
}));
