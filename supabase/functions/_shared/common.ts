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

// ---------------------------------------------------------------- TOTP (2 etapas)
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(bytes: Uint8Array) {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/=+$/, "");
  let bits = 0, value = 0; const out: number[] = [];
  for (const c of clean) {
    const i = B32.indexOf(c); if (i < 0) continue;
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}
async function totpAt(secret: string, step: number) {
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new ArrayBuffer(8); new DataView(msg).setBigUint64(0, BigInt(step));
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}
/** Confere o código aceitando ±2 janelas (±60 s) de diferença no relógio do celular. Devolve o passo usado ou null. */
export async function checkTotp(secret: string, code: string, lastStep: number | null) {
  const now = Math.floor(Date.now() / 1000 / 30);
  for (const d of [0, -1, 1, -2, 2]) {
    const step = now + d;
    if (lastStep !== null && step <= lastStep) continue; // não aceita código já usado
    if ((await totpAt(secret, step)) === code) return step;
  }
  return null;
}

/** Exige confirmação em duas etapas recente (15 min) para este usuário. */
export async function requireMfa(userId: string) {
  const { data } = await serviceClient().rpc("totp_get", { p_user: userId });
  const row = (data ?? [])[0];
  if (row?.verified && row.verified_until && new Date(row.verified_until) > new Date()) return;
  throw new HttpError(403, "MFA_REQUIRED");
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
  if (!Deno.env.get("PLAID_CLIENT_ID") || !Deno.env.get("PLAID_SECRET")) throw new HttpError(503, "PLAID_NOT_CONFIGURED");
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
    const all = [...page.added, ...page.modified];
    // Plaid: valor positivo = dinheiro SAINDO da conta
    const toRow = (t: any) => ({
      plaid_transaction_id: t.transaction_id,
      account_id: accountMap.get(t.account_id) ?? null,
      txn_date: t.date,
      description: t.merchant_name ?? t.name,
      amount: Math.abs(t.amount),
      kind: t.amount < 0 ? "income" : "expense",
      source: "plaid",
      pending: t.pending,
    });
    // quais já existem (em lotes, para não estourar o tamanho da URL)
    const existing = new Set<string>();
    const ids = all.map((t: any) => t.transaction_id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from("transactions").select("plaid_transaction_id").in("plaid_transaction_id", ids.slice(i, i + 200));
      (data ?? []).forEach((r: any) => existing.add(r.plaid_transaction_id));
    }
    const fresh = all.filter((t: any) => !existing.has(t.transaction_id)).map((t: any) => ({ ...toRow(t), category_id: guessCategory(t, toRow(t).kind) }));
    const updates = all.filter((t: any) => existing.has(t.transaction_id)).map(toRow); // mantém a categoria escolhida
    for (let i = 0; i < fresh.length; i += 500) {
      const { error } = await db.from("transactions").insert(fresh.slice(i, i + 500));
      if (error) throw new HttpError(500, error.message);
    }
    for (let i = 0; i < updates.length; i += 500) {
      const { error } = await db.from("transactions").upsert(updates.slice(i, i + 500), { onConflict: "plaid_transaction_id" });
      if (error) throw new HttpError(500, error.message);
    }
    added += page.added.length;
    modified += page.modified.length;
    const gone = page.removed.map((r: any) => r.transaction_id);
    if (gone.length) await db.from("transactions").delete().in("plaid_transaction_id", gone);
    removed += gone.length;
    next = page.next_cursor;
    hasMore = page.has_more;
  }
  await db.rpc("plaid_set_cursor", { p_item_id: itemId, p_cursor: next });
  return { added, modified, removed };
}
