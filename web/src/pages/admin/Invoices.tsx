import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { fmtDate, money, today } from "../../lib/format";
import type { Client, Invoice, InvoiceStatus } from "../../lib/types";
import { Empty, PageHeader, Stat } from "../../components/ui";

export const statusStyle: Record<InvoiceStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-sky-100 text-sky-800",
  paid: "bg-emerald-100 text-emerald-800",
  void: "bg-slate-100 text-slate-400 line-through",
};

export default function Invoices() {
  const { t, lang } = useI18n();
  const { company } = useAuth();
  const cur = company?.currency ?? "USD";
  const [rows, setRows] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [filter, setFilter] = useState<"" | InvoiceStatus | "overdue">("");

  useEffect(() => {
    supabase.from("invoices").select("*").order("created_at", { ascending: false }).then(({ data }) => setRows((data ?? []) as Invoice[]));
    supabase.from("clients").select("*").then(({ data }) => setClients((data ?? []) as Client[]));
  }, []);

  const isOverdue = (i: Invoice) => i.status === "sent" && i.due_date < today();
  const list = useMemo(() => rows.filter((i) => !filter || (filter === "overdue" ? isOverdue(i) : i.status === filter)), [rows, filter]);
  const openTotal = rows.filter((i) => i.status === "sent").reduce((s, i) => s + Number(i.total), 0);
  const overdueTotal = rows.filter(isOverdue).reduce((s, i) => s + Number(i.total), 0);
  const paidTotal = rows.filter((i) => i.status === "paid" && (i.paid_at ?? "").slice(0, 4) === today().slice(0, 4)).reduce((s, i) => s + Number(i.total), 0);
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="space-y-5">
      <PageHeader title={t("navInvoices")}>
        <Link to="/invoices/new" className="btn-primary">+ {t("newInvoice")}</Link>
      </PageHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={t("openInvoices")} value={money(openTotal, lang, cur)} />
        <Stat label={t("overdue")} value={money(overdueTotal, lang, cur)} tone={overdueTotal > 0 ? "bad" : "default"} />
        <Stat label={`${t("st_paid")} ${today().slice(0, 4)}`} value={money(paidTotal, lang, cur)} tone="good" />
      </div>
      <div className="flex flex-wrap gap-2">
        {(["", "draft", "sent", "overdue", "paid", "void"] as const).map((s) => (
          <button key={s} className={filter === s ? "btn-primary" : "btn-secondary"} onClick={() => setFilter(s)}>
            {s === "" ? t("all") : s === "overdue" ? t("overdue") : t(`st_${s}`)}
          </button>
        ))}
      </div>
      <div className="card overflow-x-auto">
        {list.length === 0 ? <Empty /> : (
          <table className="table">
            <thead><tr><th>{t("number")}</th><th>{t("client")}</th><th>{t("issueDate")}</th><th>{t("dueDate")}</th><th>{t("status")}</th><th className="text-right">{t("total")}</th></tr></thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td><Link className="font-semibold text-brand-700" to={`/invoices/${i.id}`}>{i.number}</Link></td>
                  <td>{clientName(i.client_id)}</td>
                  <td>{fmtDate(i.issue_date, lang)}</td>
                  <td className={isOverdue(i) ? "font-medium text-red-600" : ""}>{fmtDate(i.due_date, lang)}</td>
                  <td>
                    <span className={`badge ${statusStyle[i.status]}`}>{t(`st_${i.status}`)}</span>
                    {isOverdue(i) && <span className="badge ml-1 bg-red-100 text-red-700">{t("overdue")}</span>}
                  </td>
                  <td className="text-right font-semibold">{money(i.total, lang, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
