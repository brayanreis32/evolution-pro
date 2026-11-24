// Confirmação com Face ID / digital (passkey, WebAuthn), feita no servidor.
// { action: "status" } -> { has }
// { action: "register-options" } / { action: "register-verify", response, deviceName }
// { action: "auth-options" } / { action: "auth-verify", response } -> libera 15 min
import {
  generateAuthenticationOptions, generateRegistrationOptions,
  verifyAuthenticationResponse, verifyRegistrationResponse,
} from "npm:@simplewebauthn/server@10.0.1";
import { isoBase64URL } from "npm:@simplewebauthn/server@10.0.1/helpers";
import { handler, HttpError, json, requireAdmin, serviceClient } from "../_shared/common.ts";

const RP_ID = Deno.env.get("WEBAUTHN_RP_ID") ?? "evolutionprocarpentry.com";
const ORIGINS = (Deno.env.get("WEBAUTHN_ORIGINS") ?? "https://evolutionprocarpentry.com,https://www.evolutionprocarpentry.com").split(",");

Deno.serve(handler(async (req) => {
  const userId = await requireAdmin(req);
  const body = await req.json().catch(() => ({}));
  const db = serviceClient();
  const creds = ((await db.rpc("pk_list", { p_user: userId })).data ?? []) as
    { credential_id: string; public_key: string; counter: number; transports: string[] | null }[];

  if (body.action === "status") return json({ has: creds.length > 0 });

  if (body.action === "register-options") {
    // 1º cadastro: só para quem ainda não tem nenhuma confirmação; depois, só já confirmado
    const { data: ok } = await db.rpc("mfa_ok", { p_user: userId });
    const { data: totp } = await db.rpc("totp_get", { p_user: userId });
    const hasTotp = Boolean((totp ?? [])[0]?.verified);
    if ((creds.length > 0 || hasTotp) && ok !== true) throw new HttpError(403, "MFA_REQUIRED");
    const { data: u } = await db.auth.admin.getUserById(userId);
    const { data: company } = await db.from("company_settings").select("name").eq("id", 1).maybeSingle();
    const options = await generateRegistrationOptions({
      rpName: company?.name ?? "Evolution Pro",
      rpID: RP_ID,
      userName: u.user?.email ?? userId,
      userID: new TextEncoder().encode(userId),
      attestationType: "none",
      excludeCredentials: creds.map((c) => ({ id: c.credential_id, transports: (c.transports ?? undefined) as any })),
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    });
    await db.rpc("pk_set_challenge", { p_user: userId, p_challenge: options.challenge, p_kind: "register" });
    return json(options);
  }

  if (body.action === "register-verify") {
    const challenge = (await db.rpc("pk_take_challenge", { p_user: userId, p_kind: "register" })).data as string | null;
    if (!challenge) throw new HttpError(400, "PASSKEY_EXPIRED");
    let v;
    try {
      v = await verifyRegistrationResponse({
        response: body.response, expectedChallenge: challenge, expectedOrigin: ORIGINS, expectedRPID: RP_ID,
        requireUserVerification: true,
      });
    } catch (e) { console.error(e); throw new HttpError(400, "PASSKEY_FAILED"); }
    if (!v.verified || !v.registrationInfo) throw new HttpError(400, "PASSKEY_FAILED");
    const info = v.registrationInfo;
    await db.rpc("pk_add", {
      p_user: userId, p_cred: info.credentialID, p_key: isoBase64URL.fromBuffer(info.credentialPublicKey),
      p_counter: info.counter, p_transports: body.response?.response?.transports ?? null,
      p_name: String(body.deviceName ?? "").slice(0, 60) || null,
    });
    await db.rpc("mfa_grant", { p_user: userId });
    return json({ ok: true });
  }

  if (body.action === "auth-options") {
    if (!creds.length) throw new HttpError(400, "PASSKEY_NONE");
    const options = await generateAuthenticationOptions({
      rpID: RP_ID, userVerification: "required",
      allowCredentials: creds.map((c) => ({ id: c.credential_id, transports: (c.transports ?? undefined) as any })),
    });
    await db.rpc("pk_set_challenge", { p_user: userId, p_challenge: options.challenge, p_kind: "auth" });
    return json(options);
  }

  if (body.action === "auth-verify") {
    const challenge = (await db.rpc("pk_take_challenge", { p_user: userId, p_kind: "auth" })).data as string | null;
    if (!challenge) throw new HttpError(400, "PASSKEY_EXPIRED");
    const cred = creds.find((c) => c.credential_id === body.response?.id);
    if (!cred) throw new HttpError(400, "PASSKEY_FAILED");
    let v;
    try {
      v = await verifyAuthenticationResponse({
        response: body.response, expectedChallenge: challenge, expectedOrigin: ORIGINS, expectedRPID: RP_ID,
        requireUserVerification: true,
        authenticator: {
          credentialID: cred.credential_id, credentialPublicKey: isoBase64URL.toBuffer(cred.public_key),
          counter: Number(cred.counter), transports: (cred.transports ?? undefined) as any,
        },
      });
    } catch (e) { console.error(e); throw new HttpError(400, "PASSKEY_FAILED"); }
    if (!v.verified) throw new HttpError(400, "PASSKEY_FAILED");
    await db.rpc("pk_used", { p_cred: cred.credential_id, p_counter: v.authenticationInfo.newCounter });
    await db.rpc("mfa_grant", { p_user: userId });
    return json({ ok: true });
  }

  throw new HttpError(400, "BAD_ACTION");
}));
