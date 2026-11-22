// Confirmação em duas etapas (TOTP) feita inteira no servidor, num passo só.
// { action: "status" } -> { enrolled }
// { action: "enroll" } -> { secret, uri } (só se ainda não confirmou)
// { action: "verify", code } -> { ok } e libera 15 min para conectar/desconectar banco
import { base32Encode, checkTotp, handler, HttpError, json, requireAdmin, serviceClient } from "../_shared/common.ts";

Deno.serve(handler(async (req) => {
  const userId = await requireAdmin(req);
  const { action, code } = await req.json().catch(() => ({}));
  const db = serviceClient();
  const get = async () => ((await db.rpc("totp_get", { p_user: userId })).data ?? [])[0] ?? null;
  let row = await get();

  if (action === "status") return json({ enrolled: Boolean(row?.verified) });

  // recomeçar o cadastro (novo QR) — só enquanto ainda não foi confirmado
  if (action === "reset") {
    if (row?.verified) throw new HttpError(400, "MFA_ALREADY_ENROLLED");
    await db.rpc("totp_reset", { p_user: userId });
    return json({ ok: true });
  }

  if (action === "enroll") {
    if (row?.verified) {
      const { data: u0 } = await db.auth.admin.getUserById(userId);
      const { data: c0 } = await db.from("company_settings").select("name").eq("id", 1).maybeSingle();
      return json({ enrolled: true, issuer: (c0?.name ?? "Evolution Pro").replace(/[:]/g, ""), account: u0.user?.email ?? "" });
    }
    if (!row) {
      const secret = base32Encode(crypto.getRandomValues(new Uint8Array(20)));
      await db.rpc("totp_set_secret", { p_user: userId, p_secret: secret });
      row = await get();
    }
    const { data: u } = await db.auth.admin.getUserById(userId);
    const { data: company } = await db.from("company_settings").select("name").eq("id", 1).maybeSingle();
    const issuer = (company?.name ?? "Evolution Pro").replace(/[:]/g, "");
    const account = u.user?.email ?? "user";
    const label = encodeURIComponent(`${issuer}:${u.user?.email ?? "user"}`);
    const uri = `otpauth://totp/${label}?secret=${row.secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    return json({ enrolled: false, secret: row.secret, uri, issuer, account });
  }

  if (action === "verify") {
    if (!row) throw new HttpError(400, "MFA_NOT_ENROLLED");
    if (row.locked_until && new Date(row.locked_until) > new Date()) throw new HttpError(429, "MFA_LOCKED");
    const clean = String(code ?? "").replace(/\D/g, "");
    const step = clean.length === 6 ? await checkTotp(row.secret, clean, row.last_step) : null;
    await db.rpc("totp_mark", { p_user: userId, p_ok: step !== null, p_step: step ?? 0 });
    if (step === null) throw new HttpError(400, "MFA_WRONG_CODE");
    return json({ ok: true });
  }

  throw new HttpError(400, "BAD_ACTION");
}));
