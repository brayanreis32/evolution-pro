import { useState, type FormEvent } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { LangSwitch } from "../components/ui";

export default function Login() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(t("loginError"));
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-brand-600 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-500">{t("loginTitle")}</div>
          <LangSwitch />
        </div>
        <img src="/brand/logo-light.svg" alt="Evolution Pro Carpentry" className="mx-auto w-64" />
        {!supabaseConfigured && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{t("notConfigured")}</p>}
        <label className="block">
          <span className="label">{t("email")}</span>
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t("password")}</span>
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full py-3" disabled={busy}>{busy ? t("loading") : t("loginSubmit")}</button>
      </form>
    </div>
  );
}
