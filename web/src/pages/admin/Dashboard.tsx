import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { fmtDate, fmtTime, money, monthRange, today, weekRange } from "../../lib/format";
import type { BankAccount, Invoice, JobSite, PayrollRow, Session, Transaction } from "../../lib/types";
import { Empty, Stat } from "../../components/ui";

export default function Dashboard() {
  const { t, lang } = useI18n();
  const { company } = useAuth();
  const cur = company?.currency ?? "USD";
  const [fin, setFin] = useState({ income: 0, expense: 0, net: 0 });
  const [payroll, setPayroll] = useState<PayrollRow[]>([]);
  const [open, setOpen] = useState<Invoice[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [working, setWorking] = useState<Session[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [sites, setSites] = useState<JobSite[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);

  useEffect(() => {
    const m = monthRange(), w = weekRange();
    supabase.rpc("finance_summary", { p_start: m.start, p_end: m.end }).then(({ data }) => data?.[0] && setFin(data[0]));
    supabase.rpc("payroll_summary", { p_start: w.start, p_end: w.end }).then(({ data }) => setPayroll((data ?? []) as PayrollRow[]));
    supabase.from("invoices").select("*").eq("status", "sent").order("due_date").then(({ data }) => setOpen((data ?? []) as Invoice[]));
    supabase.from("transactions").select("*").order("txn_date", { ascending: false }).order("created_at", { ascending: false }).limit(6)
      .then(({ data }) => setRecent((data ?? []) as Transaction[]));
    supabase.rpc("work_sessions", { p_start: today(), p_end: today() }).then(({ data }) => setWorking(((data ?? []) as Session[]).filter((s) => s.is_open)));
    supabase.from("profiles").select("id, full_name").then(({ data }) => setNames(Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name]))));
    supabase.from("job_sites").select("*").then(({ data }) => setSites((data ?? []) as JobSite[]));
    supabase.from("bank_accounts").select("*").then(({ data }) => setAccounts((data ?? []) as BankAccount[]));
  }, []);

  const weekHours = payroll.reduce((s, r) => s + Number(r.hours), 0);
  const weekPay = payroll.reduce((s, r) => s + Number(r.amount), 0);
  const openTotal = open.reduce((s, i) => s + Number(i.total), 0);
  const overdue = open.filter((i) => i.due_date < today());
  const bank = accounts.reduce((s, a) => s + Number(a.current_balance ?? 0), 0);

  return (
    <div className="space-y-6">
      <h1>{company?.name}</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`${t("income")} ${t("month")}`} value={money(fin.income, lang, cur)} tone="good" />
        <Stat label={`${t("expense")} ${t("month")}`} value={money(fin.expense, lang, cur)} tone="bad" />
        <Stat label={`${t("net")} ${t("month")}`} value={money(fin.net, lang, cur)} tone={fin.net >= 0 ? "good" : "bad"} />
        {accounts.length > 0
          ? <Stat label={t("bankBalance")} value={money(bank, lang, cur)} sub={`${accounts.length} ${t("accounts").toLowerCase()}`} />
          : <Stat label={t("openInvoices")} value={money(openTotal, lang, cur)} sub={overdue.length ? `${overdue.length} ${t("overdue").toLowerCase()}` : undefined} tone={overdue.length ? "bad" : "default"} />}
        <Stat label={t("hoursThisWeek")} value={weekHours.toFixed(1)} />
        <Stat label={t("payrollThisWeek")} value={money(weekPay, lang, cur)} />
        {accounts.length > 0 && <Stat label={t("openInvoices")} value={money(openTotal, lang, cur)} sub={overdue.length ? `${overdue.length} ${t("overdue").toLowerCase()}` : undefined} tone={overdue.length ? "bad" : "default"} />}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card p-5">
          <h2 className="mb-3">{t("whoIsWorking")}</h2>
          {working.length === 0 ? <p className="text-sm text-slate-500">{t("nobodyWorking")}</p> : (
            <ul className="space-y-2 text-sm">
              {working.map((s) => (
                <li key={s.employee_id} className="flex items-center justify-between">
                  <span><span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-500" />{names[s.employee_id]}</span>
                  <span className="text-xs text-slate-500">{sites.find((x) => x.id === s.site_id)?.name} · {fmtTime(s.clock_in, lang)}</span>
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
