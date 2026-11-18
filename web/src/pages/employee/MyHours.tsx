import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { fmtDate, fmtDateTime, fmtShortDate, fmtTime, hours, money, weekRange } from "../../lib/format";
import { useLive } from "../../lib/live";
import type { PayrollPayment, Session } from "../../lib/types";
import { Empty, PeriodPicker, Stat, type Period } from "../../components/ui";

export default function MyHours() {
  const { profile, company } = useAuth();
  const { t, lang } = useI18n();
  const [period, setPeriod] = useState<Period>(weekRange());
  const [rows, setRows] = useState<Session[]>([]);
  const [payments, setPayments] = useState<PayrollPayment[]>([]);

  const load = () => {
    if (!profile) return;
    supabase.rpc("work_sessions", { p_start: period.start, p_end: period.end, p_employee: profile.id })
      .then(({ data }) => setRows((data ?? []) as Session[]));
    // pagamentos que cobrem este período
    supabase.from("payroll_payments").select("*").lte("period_start", period.end).gte("period_end", period.start)
      .order("period_start").then(({ data }) => setPayments((data ?? []) as PayrollPayment[]));
  };
  useEffect(load, [period, profile]); // eslint-disable-line react-hooks/exhaustive-deps
  useLive(["time_punches", "payroll_payments"], load);
  const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

  const closed = rows.filter((r) => !r.is_open);
  const minutes = closed.reduce((s, r) => s + Number(r.worked_minutes), 0);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1>{t("navMyHours")}</h1>
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="grid grid-cols-2 gap-3">
        <Stat label={t("hours")} value={hours(minutes)} sub={`${closed.length} ${t("shifts").toLowerCase()}`} />
        <Stat label={payments.length ? t("received") : t("toReceive")} value={money((minutes / 60) * Number(profile?.hourly_rate ?? 0), lang, company?.currency)}
          sub={`${money(profile?.hourly_rate, lang, company?.currency)}/h`} />
      </div>
      {payments.map((p) => (
        <div key={p.id} className="card flex items-center justify-between gap-3 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <span>✓ <b>{t("paidOn", { date: fmtDate(p.paid_at.slice(0, 10), lang) })}</b> · {fmtDate(p.period_start, lang)} – {fmtDate(p.period_end, lang)} · {t(`m_${p.method}` as "m_zelle")}</span>
          <b className="text-base">{money(p.amount, lang, company?.currency)}</b>
        </div>
      ))}
      <div className="card overflow-hidden">
        {rows.length === 0 ? <Empty /> : (
          <table className="table">
            <thead><tr><th>{t("date")}</th><th>{t("clockIn")}</th><th>{t("clockOut")}</th><th>{t("breakCol")}</th><th className="text-right">{t("worked")}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.clock_in}>
                  <td className="whitespace-nowrap">{fmtShortDate(r.work_date, lang)}</td>
                  <td>{fmtTime(r.clock_in, lang)}</td>
                  <td>{r.is_open ? <span className="badge bg-emerald-100 text-emerald-800">{t("open")}</span> : (r.clock_out && !sameDay(r.clock_in, r.clock_out) ? fmtDateTime(r.clock_out, lang) : fmtTime(r.clock_out, lang))}</td>
                  <td>{hours(r.break_minutes)}</td>
                  <td className="text-right font-medium">{hours(r.worked_minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
