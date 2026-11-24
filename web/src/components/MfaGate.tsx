import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { callFunction } from "../lib/supabase";
import { useErrorText, useI18n } from "../lib/i18n";
import { Field, Modal } from "./ui";

/**
 * Confirmação em duas etapas (Google Authenticator, Microsoft Authenticator…)
 * antes de conectar ou desconectar banco. Tudo conferido no nosso servidor,
 * num passo só (não depende do endereço de internet do celular).
 * 1ª vez: QR code para cadastrar. Depois: só o código de 6 dígitos.
 */
/** Face ID / digital (passkey). Devolve true se confirmou. */
async function passkeyConfirm(): Promise<void> {
  const st = await callFunction<{ has: boolean }>("passkey", { action: "status" });
  if (st.has) {
    const opts = await callFunction("passkey", { action: "auth-options" });
    const response = await startAuthentication(opts);
    await callFunction("passkey", { action: "auth-verify", response });
  } else {
    const opts = await callFunction("passkey", { action: "register-options" });
    const response = await startRegistration(opts);
    const deviceName = /iPhone|iPad/.test(navigator.userAgent) ? "iPhone/iPad" : /Android/.test(navigator.userAgent) ? "Android" : "Computador";
    await callFunction("passkey", { action: "register-verify", response, deviceName });
  }
}

export default function MfaGate({ onPassed, onClose }: { onPassed: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const errText = useErrorText();
  const [mode, setMode] = useState<"choose" | "loading" | "enroll" | "verify">("choose");
  const canPasskey = typeof window !== "undefined" && browserSupportsWebAuthn();
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [entry, setEntry] = useState("");
  const [uri, setUri] = useState("");
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setMode("loading"); setErr(""); setCode("");
    try {
      const r = await callFunction<{ enrolled: boolean; secret?: string; uri?: string; issuer?: string; account?: string }>("mfa", { action: "enroll" });
      setEntry(r.issuer ? `${r.issuer} (${r.account})` : "");
      if (r.enrolled) { setMode("verify"); return; }
      setSecret(r.secret ?? "");
      setUri(r.uri ?? "");
      setQr(await QRCode.toDataURL(r.uri ?? "", { margin: 1, width: 220 }));
      setMode("enroll");
    } catch (e) {
      setErr(errText(e));
      setMode("verify");
    }
  };
  useEffect(() => {
    // sem suporte a Face ID/digital: vai direto para o app autenticador
    if (!canPasskey) load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const usePasskey = async () => {
    setBusy(true); setErr("");
    try { await passkeyConfirm(); onPassed(); }
    catch (e) {
      const name = (e as { name?: string })?.name;
      setErr(name === "NotAllowedError" || name === "AbortError" ? t("pkCancelled") : errText(e));
    }
    finally { setBusy(false); }
  };

  const restart = async () => {
    try { await callFunction("mfa", { action: "reset" }); } catch { /* ignora */ }
    await load();
  };

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
        {mode === "choose" && (
          <div className="space-y-3">
            <p className="text-slate-600">{t("pkIntro")}</p>
            <button className="btn-primary w-full py-3 text-base" onClick={usePasskey} disabled={busy}>
              {busy ? t("loading") : `🔒 ${t("pkUse")}`}
            </button>
            <p className="text-xs text-slate-500">{t("pkHelp")}</p>
            {err && <p className="text-red-600">{err}</p>}
            <div className="border-t border-slate-200 pt-3">
              <button className="text-sm font-medium text-brand-600 hover:underline" onClick={load} disabled={busy}>{t("pkUseApp")}</button>
            </div>
            <div className="flex justify-end"><button className="btn-secondary" onClick={onClose}>{t("cancel")}</button></div>
          </div>
        )}
        {mode === "loading" && <p className="text-slate-500">{t("loading")}</p>}
        {mode === "enroll" && (
          <>
            {/* no celular: abre o app autenticador direto, sem escanear nem digitar */}
            {uri && (
              <a href={uri} className="btn-primary w-full lg:hidden">📲 {t("mfaOpenApp")}</a>
            )}
            <p className="text-xs text-slate-500 lg:hidden">{t("mfaOpenAppHelp")}</p>
            <p className="text-slate-600">{t("mfaEnrollHelp")}</p>
            {qr && <img src={qr} alt="QR code" className="mx-auto h-52 w-52 rounded-lg border border-slate-200 bg-white p-2" />}
            <div className="space-y-2 text-center text-xs text-slate-500">
              <p>{t("mfaManual")} <code className="break-all font-mono text-slate-800">{secret}</code></p>
              <button type="button" className="btn-secondary px-3 py-1 text-xs"
                onClick={async () => { try { await navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignora */ } }}>
                {copied ? t("copied") : t("copy")}
              </button>
              <p>{t("mfaManualType")}</p>
            </div>
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{t("mfaOldWarn")}</p>
          </>
        )}
        {(mode === "enroll" || mode === "verify") && entry && (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{t("mfaUseEntry")} <b className="text-slate-900">{entry}</b></p>
        )}
        {mode === "verify" && <p className="text-slate-600">{t("mfaVerifyHelp")}</p>}
        {(mode === "enroll" || mode === "verify") && (
          <>
            {canPasskey && <button type="button" className="text-xs font-medium text-brand-600 hover:underline" onClick={() => { setErr(""); setMode("choose"); }}>← {t("pkUse")}</button>}
            <Field label={t("mfaCode")}>
              <input className="input text-center text-2xl tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && code.length === 6 && confirm()} autoFocus />
            </Field>
            {err && <p className="text-red-600">{err}</p>}
            {mode === "enroll" && (
              <button type="button" className="text-xs font-medium text-brand-600 hover:underline" onClick={restart}>↻ {t("mfaRestart")}</button>
            )}
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
