import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { fmtDate, fmtDateTime, fmtTime, hours as fmtHours, money, today, weekRange } from "../../lib/format";
import { LONG_SHIFT_HOURS, useLive } from "../../lib/live";
import type { BankAccount, Invoice, JobSite, PayrollRow, Transaction } from "../../lib/types";

type OpenShift = { employee_id: string; site_id: string | null; clock_in: string; on_break: boolean; open_hours: number };
import { Empty, PeriodPicker, Stat, type Period } from "../../components/ui";

export default function Dashboard() {
  const { t, lang } = useI18n();
  const { company } = useAuth();
  const cur = company?.currency ?? "USD";
  // período do painel: semanal, quinzenal, mensal ou datas livres (lembrado neste aparelho)
  const [period, setPeriodState] = useState<Period>(() => {
    try { const v = JSON.parse(localStorage.getItem("dash-period") ?? "null"); if (v?.start && v?.end) return v; } catch { /* ignora */ }
    return weekRange();
  });
  const setPeriod = (p: Period) => { setPeriodState(p); try { localStorage.setItem("dash-period", JSON.stringify(p)); } catch { /* ignora */ } };
  const [paidPayroll, setPaidPayroll] = useState(0);
  const [fin, setFin] = useState({ income: 0, expense: 0, net: 0 });
  const [payroll, setPayroll] = useState<PayrollRow[]>([]);
  const [open, setOpen] = useState<Invoice[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [working, setWorking] = useState<OpenShift[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [sites, setSites] = useState<JobSite[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);

  const load = () => {
    const { start, end } = period;
    supabase.rpc("finance_summary", { p_start: start, p_end: end }).then(({ data }) => data?.[0] && setFin(data[0]));
    supabase.rpc("payroll_summary", { p_start: start, p_end: end }).then(({ data }) => setPayroll((data ?? []) as PayrollRow[]));
    supabase.from("transactions").select("amount").eq("kind", "expense").like("description", "Folha de pagamento%")
      .gte("txn_date", start).lte("txn_date", end)
      .then(({ data }) => setPaidPayroll((data ?? []).reduce((s, x) => s + Number(x.amount), 0)));
    supabase.from("invoices").select("*").eq("status", "sent").order("due_date").then(({ data }) => setOpen((data ?? []) as Invoice[]));
    supabase.from("transactions").select("*").gte("txn_date", start).lte("txn_date", end)
      .order("txn_date", { ascending: false }).order("created_at", { ascending: false }).limit(8)
      .then(({ data }) => setRecent((data ?? []) as Transaction[]));
    supabase.rpc("open_shifts").then(({ data }) => setWorking((data ?? []) as OpenShift[]));
    supabase.from("profiles").select("id, full_name").then(({ data }) => setNames(Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name]))));
    supabase.from("job_sites").select("*").then(({ data }) => setSites((data ?? []) as JobSite[]));
    supabase.from("bank_accounts").select("*").then(({ data }) => setAccounts((data ?? []) as BankAccount[]));
  };
  useEffect(load, [period]); // eslint-disable-line react-hooks/exhaustive-deps
  // ao vivo: funcionário bateu o ponto ou alguém foi pago → painel atualiza sozinho
  useLive(["time_punches", "site_assignments", "payroll_payments", "transactions", "bank_accounts"], load);
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);

  const weekHours = payroll.reduce((s, r) => s + Number(r.hours), 0);
  const weekPay = payroll.reduce((s, r) => s + Number(r.amount), 0);
  const openTotal = open.reduce((s, i) => s + Number(i.total), 0);
  const overdue = open.filter((i) => i.due_date < today());
  const bank = accounts.reduce((s, a) => s + Number(a.current_balance ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1>{company?.name}</h1>
        <PeriodPicker value={period} onChange={setPeriod} mode="report" />
      </div>
      <p className="-mt-3 text-sm text-slate-500">{fmtDate(period.start, lang)} – {fmtDate(period.end, lang)}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("income")} value={money(fin.income, lang, cur)} tone="good" />
        <Stat label={t("expense")} value={money(fin.expense, lang, cur)} tone="bad" />
        <Stat label={t("net")} value={money(fin.net, lang, cur)} tone={fin.net >= 0 ? "good" : "bad"} />
        {accounts.length > 0
          ? <Stat label={t("bankBalance")} value={money(bank, lang, cur)} sub={`${accounts.length} ${t("accounts").toLowerCase()}`} />
          : <Stat label={t("openInvoices")} value={money(openTotal, lang, cur)} sub={overdue.length ? `${overdue.length} ${t("overdue").toLowerCase()}` : undefined} tone={overdue.length ? "bad" : "default"} />}
        <Stat label={t("hoursPeriod")} value={fmtHours(weekHours * 60)} />
        <Stat label={t("payrollDue")} value={money(weekPay, lang, cur)} />
        <Stat label={t("payrollPaid")} value={money(paidPayroll, lang, cur)} tone={paidPayroll > 0 ? "good" : "default"} />
        {accounts.length > 0 && <Stat label={t("openInvoices")} value={money(openTotal, lang, cur)} sub={overdue.length ? `${overdue.length} ${t("overdue").toLowerCase()}` : undefined} tone={overdue.length ? "bad" : "default"} />}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card p-5">
          <h2 className="mb-3">{t("whoIsWorking")}</h2>
          {working.length === 0 ? <p className="text-sm text-slate-500">{t("nobodyWorking")}</p> : (
            <ul className="space-y-2 text-sm">
              {working.map((s) => (
                <li key={s.employee_id} className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span><span className={`mr-2 inline-block h-2 w-2 rounded-full ${s.on_break ? "bg-amber-500" : "bg-emerald-500"}`} />{names[s.employee_id]}{s.on_break && <span className="ml-1 text-xs text-amber-700">({t("st_break").toLowerCase()})</span>}</span>
                    <span className="text-xs text-slate-500">{sites.find((x) => x.id === s.site_id)?.name} · {new Date(s.clock_in) < startOfToday ? fmtDateTime(s.clock_in, lang) : fmtTime(s.clock_in, lang)}</span>
                  </div>
                  {Number(s.open_hours) > LONG_SHIFT_HOURS && (
                    <Link to="/horas" className="text-xs font-medium text-red-600">⚠ {t("longShift", { h: Math.floor(Number(s.open_hours)) })}</Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between"><h2>{t("openInvoices")}</h2><Link to="/invoices" className="text-xs font-semibold text-brand-600">→</Link></div>
          {open.length === 0 ? <Empty /> : (
            <ul className="space-y-2 text-sm">
              {open.slice(0, 6).map((i) => (
                <li key={i.id} className="flex justify-between">
                  <Link to={`/invoices/${i.id}`} className="font-medium text-brand-700">{i.number}</Link>
                  <span className={i.due_date < today() ? "text-red-600" : "text-slate-500"}>{fmtDate(i.due_date, lang)}</span>
                  <span className="font-semibold">{money(i.total, lang, cur)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between"><h2>{t("recentTxns")}</h2><Link to="/financeiro" className="text-xs font-semibold text-brand-600">→</Link></div>
          {recent.length === 0 ? <Empty /> : (
            <ul className="space-y-2 text-sm">
              {recent.map((x) => (
                <li key={x.id} className="flex justify-between gap-2">
                  <span className="truncate">{x.description}</span>
                  <span className={`shrink-0 font-semibold ${x.kind === "income" ? "text-emerald-600" : "text-red-600"}`}>
                    {x.kind === "income" ? "+" : "−"}{money(x.amount, lang, cur)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
