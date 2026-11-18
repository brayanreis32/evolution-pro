import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { Field, Modal } from "./ui";

/**
 * Confirmação em duas etapas (TOTP: Google Authenticator, Microsoft Authenticator…)
 * exigida antes de abrir a conexão com o banco (Plaid Link).
 * 1ª vez: mostra o QR code para cadastrar. Depois: só o código de 6 dígitos.
 */
export async function hasAal2() {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel === "aal2";
}

export default function MfaGate({ onPassed, onClose }: { onPassed: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"loading" | "enroll" | "verify">("loading");
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") { onPassed(); return; }
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = factors?.totp?.[0];
      if (verified) { setFactorId(verified.id); setMode("verify"); return; }
      // remove cadastros que ficaram pela metade e começa um novo
      for (const f of (factors?.all ?? []).filter((x) => x.status === "unverified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Evolution Pro ${new Date().toISOString().slice(0, 10)}` });
      if (error || !data || data.type !== "totp") { setErr(error?.message ?? "MFA error"); setMode("verify"); return; }
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setMode("enroll");
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = async () => {
    setBusy(true); setErr("");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (error) { setErr(t("mfaWrong")); return; }
    onPassed();
  };

  return (
    <Modal title={t("mfaTitle")} onClose={onClose}>
      <div className="space-y-4 text-sm">
        {mode === "loading" && <p className="text-slate-500">{t("loading")}</p>}
        {mode === "enroll" && (
          <>
            <p className="text-slate-600">{t("mfaEnrollHelp")}</p>
            {qr && <img src={qr} alt="QR code" className="mx-auto h-48 w-48 rounded-lg border border-slate-200 bg-white p-2" />}
            <p className="text-center text-xs text-slate-500">{t("mfaManual")} <code className="break-all font-mono text-slate-800">{secret}</code></p>
          </>
        )}
        {mode === "verify" && <p className="text-slate-600">{t("mfaVerifyHelp")}</p>}
        {mode !== "loading" && (
          <>
            <Field label={t("mfaCode")}>
              <input className="input text-center text-2xl tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && code.length === 6 && confirm()} autoFocus />
            </Field>
            {err && <p className="text-red-600">{err}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={onClose}>{t("cancel")}</button>
              <button className="btn-primary" onClick={confirm} disabled={busy || code.length !== 6}>{t("mfaConfirm")}</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
