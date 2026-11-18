// Recebe os avisos (webhooks) do Plaid e sincroniza o banco sozinho.
// Cada aviso é verificado pela assinatura do Plaid (JWT ES256 no header
// Plaid-Verification + SHA-256 do corpo), então ninguém consegue forjar.
// Publicado SEM exigir login do Supabase (o Plaid não tem login), por isso
// a verificação da assinatura é obrigatória.
import { decodeProtectedHeader, importJWK, jwtVerify } from "npm:jose@5.9.6";
import { json, plaid, serviceClient, syncItem } from "../_shared/common.ts";

const keyCache = new Map<string, CryptoKey | Uint8Array>();

async function verify(req: Request, raw: string) {
  const token = req.headers.get("plaid-verification");
  if (!token) return false;
  const { alg, kid } = decodeProtectedHeader(token);
  if (alg !== "ES256" || !kid) return false;
  let key = keyCache.get(kid);
  if (!key) {
    const { key: jwk } = await plaid("/webhook_verification_key/get", { key_id: kid });
    if (jwk.expired_at) return false;
    key = await importJWK(jwk, "ES256");
    keyCache.set(kid, key);
  }
  const { payload } = await jwtVerify(token, key, { algorithms: ["ES256"], maxTokenAge: "5 min" });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return payload.request_body_sha256 === hex;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const raw = await req.text();
  try {
    if (!(await verify(req, raw))) return json({ error: "INVALID_SIGNATURE" }, 401);
  } catch (e) {
    console.error("webhook verification failed", e);
    return json({ error: "INVALID_SIGNATURE" }, 401);
  }

  const body = JSON.parse(raw);
  const { webhook_type, webhook_code, item_id } = body;
  console.log("plaid webhook", webhook_type, webhook_code, item_id);

  if (webhook_type === "TRANSACTIONS" && webhook_code === "SYNC_UPDATES_AVAILABLE" && item_id) {
    const db = serviceClient();
    const { data: tokens } = await db.rpc("plaid_tokens_list");
    const t = (tokens ?? []).find((x: any) => x.item_id === item_id);
    if (t) await syncItem(db, t.item_id, t.access_token, t.cursor);
  }
  return json({ ok: true });
});
