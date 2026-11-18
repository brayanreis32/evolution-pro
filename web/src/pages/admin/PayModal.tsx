import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useErrorText, useI18n } from "../../lib/i18n";
import { fmtDate, fmtDateTime, fmtTime, hours, money } from "../../lib/format";
import type { JobSite, PayrollRow, Profile, Session } from "../../lib/types";
import { Field, Modal } from "../../components/ui";

type Period = { start: string; end: string };

function CopyButton({ text }: { text: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* sem permissão */ }
  };
  return <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={copy}>{done ? t("copied") : t("copy")}</button>;
}

/** Conferência + pagamento de um funcionário no período. */
export default function PayModal({ row, period, employee, sites, onClose, onPaid, onFix }: {
  row: PayrollRow; period: Period; employee: Profile | null; sites: JobSite[];
  onClose: () => void; onPaid: () => void; onFix: () => void;
}) {
  const { t, lang } = useI18n();
  const { company } = useAuth();
  const errText = useErrorText();
  const cur = company?.currency ?? "USD";
  const [sessions, setSessions] = useState<Session[]>([]);
  const [adjustment, setAdjustment] = useState("");
  const [method, setMethod] = useState("zelle");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.rpc("work_sessions", { p_start: period.start, p_end: period.end, p_employee: row.employee_id })
      .then(({ data }) => setSessions((data ?? []) as Session[]));
  }, [row.employee_id, period.start, period.end]);

  const closed = sessions.filter((s) => !s.is_open);
  const open = sessions.filter((s) => s.is_open);
  const minutes = closed.reduce((s, x) => s + Number(x.worked_minutes), 0);
  const gross = Math.round((minutes / 60) * Number(row.hourly_rate) * 100) / 100;
  const adj = Number(adjustment || 0);
  const total = Math.round((gross + adj) * 100) / 100;
  const siteName = (id: string | null) => sites.find((s) => s.id === id)?.name ?? "—";
  const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

  const pay = async () => {
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("pay_employee", {
      p_employee: row.employee_id, p_start: period.start, p_end: period.end,
      p_method: method, p_reference: reference || null, p_adjustment: adj, p_note: note || null,
    });
    setBusy(false);
    if (error) setErr(errText(error)); else onPaid();
  };

  return (
    <Modal title={t("payTitle", { name: row.full_name })} onClose={onClose} wide>
      <div className="space-y-5">
        {/* 1. conferência das horas */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base">1. {t("reviewHours")} · {fmtDate(period.start, lang)} – {fmtDate(period.end, lang)}</h3>
            <button className="btn-ghost px-2 text-sm text-brand-600" onClick={onFix}>✎ {t("fixPunches")}</button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="table">
              <thead><tr><th>{t("date")}</th><th>{t("jobSite")}</th><th>{t("clockIn")}</th><th>{t("clockOut")}</th><th>{t("breakCol")}</th><th className="text-right">{t("worked")}</th></tr></thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.clock_in} className={s.is_open ? "bg-red-50" : ""}>
                    <td>{fmtDate(s.work_date, lang)}</td>
                    <td>{siteName(s.site_id)}</td>
                    <td>{fmtTime(s.clock_in, lang)}</td>
                    <td>{s.is_open
                      ? <span className="badge bg-red-100 text-red-700">{t("open")}</span>
                      : (s.clock_out && !sameDay(s.clock_in, s.clock_out) ? fmtDateTime(s.clock_out, lang) : fmtTime(s.clock_out, lang))}</td>
                    <td>{hours(s.break_minutes)}</td>
                    <td className="text-right font-medium">{hours(s.worked_minutes)}</td>
                  </tr>
                ))}
                {!sessions.length && <tr><td colSpan={6} className="text-center text-slate-500">—</td></tr>}
              </tbody>
            </table>
          </div>
          {open.length > 0 && <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">{t("err_OPEN_SHIFTS")}</p>}
        </div>

        {/* 2. valores */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
            <div className="flex justify-between"><span>{t("hours")}</span><b>{hours(minutes)}</b></div>
            <div className="flex justify-between"><span>{t("rate")}</span><b>{money(row.hourly_rate, lang, cur)}</b></div>
            <div className="flex justify-between"><span>{t("gross")}</span><b>{money(gross, lang, cur)}</b></div>
            {adj !== 0 && <div className="flex justify-between"><span>{t("adjustment").split(" (")[0]}</span><b>{adj > 0 ? "+" : ""}{money(adj, lang, cur)}</b></div>}
            <div className="flex justify-between border-t border-slate-300 pt-2 text-base"><span className="font-semibold">{t("totalToPay")}</span><b>{money(total, lang, cur)}</b></div>
          </div>
          <div className="space-y-3">
            <Field label={t("adjustment")}><input className="input" type="number" step="0.01" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} placeholder="0.00" /></Field>
            <Field label={t("notes")}><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
        </div>

        {/* 3. pagamento */}
        <div className="space-y-3">
          <Field label={t("method")}>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {["zelle", "cash", "check", "transfer", "other"].map((m) => <option key={m} value={m}>{t(`m_${m}` as "m_zelle")}</option>)}
            </select>
          </Field>
          {method === "zelle" && (
            employee?.zelle_contact ? (
              <div className="space-y-2 rounded-lg border border-brand-100 bg-brand-50 p-4 text-sm">
                <p className="text-slate-600">{t("zelleSteps")}</p>
                <div className="flex items-center justify-between gap-2">
                  <span><span className="text-slate-500">Zelle:</span> <b>{employee.zelle_contact}</b>{employee.zelle_name && <span className="text-slate-500"> ({employee.zelle_name})</span>}</span>
                  <CopyButton text={employee.zelle_contact} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span><span className="text-slate-500">{t("amount")}:</span> <b>{money(total, lang, cur)}</b></span>
                  <CopyButton text={total.toFixed(2)} />
                </div>
              </div>
            ) : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t("noZelle")}</p>
          )}
          <Field label={t("reference")}><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>{t("cancel")}</button>
          <button className="btn bg-emerald-600 text-white hover:bg-emerald-700" onClick={pay} disabled={busy || open.length > 0 || total <= 0}>
            ✓ {t("confirmPayment")} · {money(total, lang, cur)}
          </button>
        </div>
      </div>
    </Modal>
  );
}
