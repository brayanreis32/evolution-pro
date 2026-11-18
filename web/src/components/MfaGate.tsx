import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { callFunction } from "../lib/supabase";
import { useErrorText, useI18n } from "../lib/i18n";
import { Field, Modal } from "./ui";

/**
 * Confirmação em duas etapas (Google Authenticator, Microsoft Authenticator…)
 * antes de conectar ou desconectar banco. Tudo conferido no nosso servidor,
 * num passo só (não depende do endereço de internet do celular).
 * 1ª vez: QR code para cadastrar. Depois: só o código de 6 dígitos.
 */
export default function MfaGate({ onPassed, onClose }: { onPassed: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const errText = useErrorText();
  const [mode, setMode] = useState<"loading" | "enroll" | "verify">("loading");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await callFunction<{ enrolled: boolean; secret?: string; uri?: string }>("mfa", { action: "enroll" });
        if (r.enrolled) { setMode("verify"); return; }
        setSecret(r.secret ?? "");
        setQr(await QRCode.toDataURL(r.uri ?? "", { margin: 1, width: 220 }));
        setMode("enroll");
      } catch (e) {
        setErr(errText(e));
        setMode("verify");
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = async () => {
    setBusy(true); setErr("");
    try {
      await callFunction("mfa", { action: "verify", code: code.trim() });
      onPassed();
    } catch (e) {
      setErr(errText(e));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("mfaTitle")} onClose={onClose}>
      <div className="space-y-4 text-sm">
        {mode === "loading" && <p className="text-slate-500">{t("loading")}</p>}
        {mode === "enroll" && (
          <>
            <p className="text-slate-600">{t("mfaEnrollHelp")}</p>
            {qr && <img src={qr} alt="QR code" className="mx-auto h-52 w-52 rounded-lg border border-slate-200 bg-white p-2" />}
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
              <button className="btn-primary" onClick={confirm} disabled={busy || code.length !== 6}>{busy ? t("loading") : t("mfaConfirm")}</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
