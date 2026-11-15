import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Cliente com service role (ignora RLS) — usar só no servidor. */
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

/** Garante que quem chamou está logado e é admin. Retorna o id do usuário. */
export async function requireAdmin(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) throw new HttpError(401, "NOT_AUTHENTICATED");
  const { data: isAdmin } = await userClient.rpc("is_admin");
  if (!isAdmin) throw new HttpError(403, "ADMIN_ONLY");
  return user.id;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try {
      return await fn(req);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      console.error(e);
      return json({ error: (e as Error).message }, status);
    }
  };
}

// ---------------------------------------------------------------- Plaid
const PLAID_ENV = Deno.env.get("PLAID_ENV") ?? "sandbox"; // sandbox | production

export async function plaid<T = any>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://${PLAID_ENV}.plaid.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: Deno.env.get("PLAID_CLIENT_ID"),
      secret: Deno.env.get("PLAID_SECRET"),
      ...body,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new HttpError(400, data.error_message ?? data.error_code ?? "PLAID_ERROR");
  return data as T;
}

/** Atualiza saldos e puxa transações novas/alteradas/removidas de um item. */
export async function syncItem(db: SupabaseClient, itemId: string, accessToken: string, cursor: string | null) {
  // contas + saldos
  const acc = await plaid("/accounts/get", { access_token: accessToken });
  const { data: item } = await db.from("plaid_items").select("id, institution_name").eq("item_id", itemId).single();
  for (const a of acc.accounts) {
    await db.from("bank_accounts").upsert({
      plaid_account_id: a.account_id,
      plaid_item_id: item!.id,
      name: a.official_name ?? a.name,
      institution: item!.institution_name,
      mask: a.mask,
      account_type: a.subtype ?? a.type,
      current_balance: a.balances.current,
      available_balance: a.balances.available,
      currency: a.balances.iso_currency_code ?? "USD",
      updated_at: new Date().toISOString(),
    }, { onConflict: "plaid_account_id" });
  }
  const { data: accounts } = await db.from("bank_accounts").select("id, plaid_account_id").eq("plaid_item_id", item!.id);
  const accountMap = new Map((accounts ?? []).map((r) => [r.plaid_account_id, r.id]));

  // categorias padrão para sugerir
  const { data: cats } = await db.from("categories").select("id, name, kind");
  const catId = (name: string, kind: string) => cats?.find((c) => c.name === name && c.kind === kind)?.id ?? null;
  const guessCategory = (t: any, kind: string) => {
    const pfc: string = t.personal_finance_category?.primary ?? "";
    if (kind === "income") return catId("Outras entradas", "income");
    if (pfc === "TRANSPORTATION" && /GAS/.test(t.personal_finance_category?.detailed ?? "")) return catId("Combustível", "expense");
    if (pfc === "FOOD_AND_DRINK") return catId("Alimentação", "expense");
    if (pfc === "HOME_IMPROVEMENT") return catId("Material", "expense");
    return catId("Outras despesas", "expense");
  };

  let next = cursor;
  let hasMore = true;
  let added = 0, modified = 0, removed = 0;
  while (hasMore) {
    const page = await plaid("/transactions/sync", { access_token: accessToken, cursor: next ?? undefined, count: 500 });
    for (const t of [...page.added, ...page.modified]) {
      // Plaid: valor positivo = dinheiro SAINDO da conta
      const kind = t.amount < 0 ? "income" : "expense";
      const row: Record<string, unknown> = {
        plaid_transaction_id: t.transaction_id,
        account_id: accountMap.get(t.account_id) ?? null,
        txn_date: t.date,
        description: t.merchant_name ?? t.name,
        amount: Math.abs(t.amount),
        kind,
        source: "plaid",
        pending: t.pending,
      };
      const { data: existing } = await db.from("transactions").select("id").eq("plaid_transaction_id", t.transaction_id).maybeSingle();
      if (existing) {
        await db.from("transactions").update(row).eq("id", existing.id); // mantém a categoria que você escolheu
      } else {
        row.category_id = guessCategory(t, kind);
        await db.from("transactions").insert(row);
      }
    }
    added += page.added.length;
    modified += page.modified.length;
    const ids = page.removed.map((r: any) => r.transaction_id);
    if (ids.length) await db.from("transactions").delete().in("plaid_transaction_id", ids);
    removed += ids.length;
    next = page.next_cursor;
    hasMore = page.has_more;
  }
  await db.rpc("plaid_set_cursor", { p_item_id: itemId, p_cursor: next });
  return { added, modified, removed };
}
