import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { docT, useI18n } from "../../lib/i18n";
import { fmtDate, money } from "../../lib/format";
import type { Client, Company, Invoice, InvoiceItem } from "../../lib/types";

export function InvoiceDocument({ inv, items, client, company }: { inv: Invoice; items: InvoiceItem[]; client: Client | null; company: Company }) {
  const d = docT(inv.language);
  const L = inv.language;
  const cur = company.currency;
  const brand = company.brand_color || "#0f3d5e";
  const terms = Math.round((new Date(inv.due_date).getTime() - new Date(inv.issue_date).getTime()) / 86400000);
  const companyLines = [
    company.address,
    [company.city, company.state].filter(Boolean).join(", ") + (company.zip ? ` ${company.zip}` : ""),
    company.phone, company.email, company.website,
  ].filter((x) => x && x.trim());
  const clientLines = client ? [
    client.contact_name,
    client.address,
    [client.city, client.state].filter(Boolean).join(", ") + (client.zip ? ` ${client.zip}` : ""),
    client.phone, client.email,
  ].filter((x) => x && x.trim()) : [];

  return (
    <div className="relative mx-auto flex min-h-[11in] w-[8.5in] flex-col bg-white text-[13px] leading-relaxed text-slate-700 shadow-xl print:min-h-[10in] print:w-full print:shadow-none" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
      <div style={{ height: 10, background: brand }} />
      <div className="flex-1 px-12 pt-10 pb-12 print:px-2">
        {/* cabeçalho */}
        <div className="flex items-start justify-between gap-8">
          <div className="flex items-start gap-4">
            {company.logo_url && <img src={company.logo_url} alt="" className="max-h-24 max-w-[180px] object-contain" />}
            <div>
              <div className="text-xl font-bold text-slate-900">{company.name}</div>
              {companyLines.map((l) => <div key={l} className="text-slate-500">{l}</div>)}
              {company.tax_id && <div className="text-slate-500">EIN {company.tax_id}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-extrabold tracking-tight" style={{ color: brand }}>{d("INVOICE")}</div>
            <table className="mt-3 ml-auto text-right">
              <tbody>
                <tr><td className="pr-4 text-slate-500">{d("invoiceNo")}</td><td className="font-semibold text-slate-900">{inv.number}</td></tr>
                <tr><td className="pr-4 text-slate-500">{d("date")}</td><td className="text-slate-900">{fmtDate(inv.issue_date, L)}</td></tr>
                <tr><td className="pr-4 text-slate-500">{d("due")}</td><td className="text-slate-900">{fmtDate(inv.due_date, L)}</td></tr>
                {terms > 0 && <tr><td className="pr-4 text-slate-500">{d("terms")}</td><td className="text-slate-900">{d("netDays", { n: terms })}</td></tr>}
                {inv.po_number && <tr><td className="pr-4 text-slate-500">{d("po")}</td><td className="text-slate-900">{inv.po_number}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* cliente / local */}
        <div className="mt-10 grid grid-cols-2 gap-8">
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-widest" style={{ color: brand }}>{d("billTo")}</div>
            <div className="text-base font-semibold text-slate-900">{client?.name}</div>
            {clientLines.map((l) => <div key={l}>{l}</div>)}
          </div>
          {inv.job_address && (
            <div>
              <div className="mb-1 text-[11px] font-bold uppercase tracking-widest" style={{ color: brand }}>{d("jobSite")}</div>
              <div className="whitespace-pre-line">{inv.job_address}</div>
            </div>
          )}
        </div>

        {/* itens */}
        <table className="mt-8 w-full border-collapse">
          <thead>
            <tr style={{ background: brand }} className="text-left text-[11px] uppercase tracking-wider text-white">
              <th className="px-3 py-2.5 font-semibold">{d("description")}</th>
              <th className="w-20 px-3 py-2.5 text-right font-semibold">{d("qty")}</th>
              <th className="w-28 px-3 py-2.5 text-right font-semibold">{d("rate")}</th>
              <th className="w-32 px-3 py-2.5 text-right font-semibold">{d("amount")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, n) => (
              <tr key={n} className="border-b border-slate-200 align-top" style={{ breakInside: "avoid" }}>
                <td className="whitespace-pre-line px-3 py-3 text-slate-900">{i.description}</td>
                <td className="px-3 py-3 text-right">{Number(i.quantity).toLocaleString(L === "pt" ? "pt-BR" : "en-US")}{i.unit ? ` ${i.unit}` : ""}</td>
                <td className="px-3 py-3 text-right">{money(i.unit_price, L, cur)}</td>
                <td className="px-3 py-3 text-right font-medium text-slate-900">{money(Number(i.quantity) * Number(i.unit_price), L, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* totais */}
        <div className="mt-6 flex justify-end" style={{ breakInside: "avoid" }}>
          <table className="w-72">
            <tbody>
              <tr><td className="py-1 text-slate-500">{d("subtotal")}</td><td className="py-1 text-right">{money(inv.subtotal, L, cur)}</td></tr>
              {Number(inv.discount) > 0 && <tr><td className="py-1 text-slate-500">{d("discount")}</td><td className="py-1 text-right">−{money(inv.discount, L, cur)}</td></tr>}
              {Number(inv.tax_rate) > 0 && <tr><td className="py-1 text-slate-500">{d("tax")} ({Number(inv.tax_rate)}%)</td><td className="py-1 text-right">{money(inv.tax_amount, L, cur)}</td></tr>}
              <tr className="border-t-2" style={{ borderColor: brand }}>
                <td className="pt-3 text-base font-bold text-slate-900">{inv.status === "paid" ? d("total") : d("balanceDue")}</td>
                <td className="pt-3 text-right text-xl font-extrabold" style={{ color: brand }}>{money(inv.total, L, cur)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* observações / pagamento */}
        <div className="mt-10 grid grid-cols-2 gap-8" style={{ breakInside: "avoid" }}>
          {company.payment_instructions && (
            <div>
              <div className="mb-1 text-[11px] font-bold uppercase tracking-widest" style={{ color: brand }}>{d("paymentInstructions")}</div>
              <div className="whitespace-pre-line">{company.payment_instructions}</div>
            </div>
          )}
          {inv.notes && (
            <div>
              <div className="mb-1 text-[11px] font-bold uppercase tracking-widest" style={{ color: brand }}>{d("notes")}</div>
              <div className="whitespace-pre-line">{inv.notes}</div>
            </div>
          )}
        </div>
      </div>

      {(inv.status === "paid" || inv.status === "void") && (
        <div className={`pointer-events-none absolute right-16 top-56 rotate-[-14deg] rounded-lg border-4 px-6 py-2 text-4xl font-black tracking-widest opacity-80 ${inv.status === "paid" ? "border-emerald-600 text-emerald-600" : "border-red-500 text-red-500"}`}>
          {inv.status === "paid" ? d("paid") : d("void")}
        </div>
      )}

      <div className="px-12 pb-6 text-center text-[11px] text-slate-400">
        {company.name}{company.phone ? ` · ${company.phone}` : ""}{company.email ? ` · ${company.email}` : ""}
      </div>
    </div>
  );
}

export default function InvoiceView() {
  const { id } = useParams();
  const { company } = useAuth();
  const { t } = useI18n();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [client, setClient] = useState<Client | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("invoices").select("*").eq("id", id).single();
      if (!data) return;
      setInv(data as Invoice);
      const [it, c] = await Promise.all([
        supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position"),
        supabase.from("clients").select("*").eq("id", data.client_id).single(),
      ]);
      setItems((it.data ?? []) as InvoiceItem[]);
      setClient(c.data as Client);
      document.title = `${data.number} — ${c.data?.name ?? ""}`;
    })();
    return () => { document.title = "Evolution Pro"; };
  }, [id]);

  if (!inv || !company) return <div className="p-8 text-slate-500">{t("loading")}</div>;

  return (
    <div className="min-h-screen bg-slate-200 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[8.5in] items-center justify-between px-4">
        <Link to={`/invoices/${inv.id}`} className="btn-secondary">← {t("back")}</Link>
        <button className="btn-primary" onClick={() => window.print()}>🖨 {t("print")}</button>
      </div>
      <div className="overflow-x-auto px-2">
        <InvoiceDocument inv={inv} items={items} client={client} company={company} />
      </div>
    </div>
  );
}
