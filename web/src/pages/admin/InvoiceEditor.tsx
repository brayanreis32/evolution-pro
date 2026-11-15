import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { addDays, money, today } from "../../lib/format";
import type { Client, Invoice, InvoiceItem, InvoiceStatus, JobSite, Lang } from "../../lib/types";
import { Field, useToast } from "../../components/ui";
import { ClientForm } from "./Clients";
import { statusStyle } from "./Invoices";

const emptyItem = (position: number): InvoiceItem => ({ position, description: "", quantity: 1, unit: "", unit_price: 0 });

export default function InvoiceEditor() {
  const { id } = useParams();
  const isNew = id === "new";
  const nav = useNavigate();
  const { t, lang } = useI18n();
  const { company, isDeveloper } = useAuth();
  const toast = useToast();
  const cur = company?.currency ?? "USD";

  const [inv, setInv] = useState<Partial<Invoice>>({
    issue_date: today(), status: "draft", language: "en", tax_rate: 0, discount: 0,
    notes: company?.invoice_notes ?? "",
  });
  const [items, setItems] = useState<InvoiceItem[]>([emptyItem(0)]);
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<JobSite[]>([]);
  const [newClient, setNewClient] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("clients").select("*").order("name").then(({ data }) => {
      const list = (data ?? []) as Client[];
      setClients(list);
      if (isNew && list.length === 1) setInv((x) => ({ ...x, client_id: list[0].id }));
    });
    supabase.from("job_sites").select("*").order("created_at", { ascending: false }).then(({ data }) => setSites((data ?? []) as JobSite[]));
    if (!isNew) {
      supabase.from("invoices").select("*").eq("id", id).single().then(({ data }) => data && setInv(data as Invoice));
      supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position")
        .then(({ data }) => setItems(data?.length ? (data as InvoiceItem[]) : [emptyItem(0)]));
    }
  }, [id, isNew]);

  // vencimento padrão
  useEffect(() => {
    if (isNew && company && inv.issue_date) setInv((x) => ({ ...x, due_date: addDays(x.issue_date!, company.payment_terms_days) }));
  }, [inv.issue_date, company, isNew]);

  const locked = inv.status === "paid" || inv.status === "void";
  const subtotal = items.reduce((s, i) => s + Math.round(Number(i.quantity) * Number(i.unit_price) * 100) / 100, 0);
  const base = Math.max(subtotal - Number(inv.discount ?? 0), 0);
  const tax = Math.round(base * Number(inv.tax_rate ?? 0)) / 100;
  const total = base + tax;

  const updateItem = (idx: number, patch: Partial<InvoiceItem>) => setItems((xs) => xs.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  const moveItem = (idx: number, dir: -1 | 1) => setItems((xs) => {
    const j = idx + dir;
    if (j < 0 || j >= xs.length) return xs;
    const c = [...xs];
    [c[idx], c[j]] = [c[j], c[idx]];
    return c;
  });

  const save = async (): Promise<string | null> => {
    if (!inv.client_id) { toast.fail(t("needClient")); return null; }
    setBusy(true);
    try {
      const row = {
        client_id: inv.client_id, site_id: inv.site_id || null, job_address: inv.job_address || null, po_number: inv.po_number || null,
        issue_date: inv.issue_date, due_date: inv.due_date || null, language: inv.language, tax_rate: Number(inv.tax_rate || 0),
        discount: Number(inv.discount || 0), notes: inv.notes || null,
      };
      let invoiceId = inv.id;
      if (!invoiceId) {
        const { data, error } = await supabase.from("invoices").insert(row).select().single();
        if (error) throw error;
        invoiceId = data.id;
      } else {
        const { error } = await supabase.from("invoices").update(row).eq("id", invoiceId);
        if (error) throw error;
      }
      // substitui os itens
      await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
      const clean = items.filter((i) => i.description.trim()).map((i, n) => ({
        invoice_id: invoiceId, position: n, description: i.description.trim(), quantity: Number(i.quantity),
        unit: i.unit || null, unit_price: Number(i.unit_price),
      }));
      if (clean.length) {
        const { error } = await supabase.from("invoice_items").insert(clean);
        if (error) throw error;
      }
      const { data: fresh } = await supabase.from("invoices").select("*").eq("id", invoiceId).single();
      setInv(fresh as Invoice);
      toast.ok(t("saved"));
      if (isNew) nav(`/invoices/${invoiceId}`, { replace: true });
      return invoiceId!;
    } catch (e) {
      toast.fail((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: InvoiceStatus) => {
    const invoiceId = locked ? inv.id! : await save();
    if (!invoiceId) return;
    const { data, error } = await supabase.from("invoices").update({ status }).eq("id", invoiceId).select().single();
    if (error) toast.fail(error.message); else setInv(data as Invoice);
  };

  const duplicate = async () => {
    setInv({ ...inv, id: undefined, number: undefined, status: "draft", issue_date: today(), paid_at: null });
    nav("/invoices/new", { replace: false });
  };

  const remove = async () => {
    if (!inv.id || !confirm(t(inv.status === "draft" ? "confirmDelete" : "confirmDeleteInvoice"))) return;
    // lançamento automático de invoice pago sai junto
    await supabase.from("transactions").delete().eq("invoice_id", inv.id).eq("source", "invoice");
    const { error } = await supabase.from("invoices").delete().eq("id", inv.id);
    if (error) { toast.fail(error.message); return; }
    nav("/invoices");
  };

  const preview = async () => {
    const invoiceId = locked ? inv.id : await save();
    if (invoiceId) nav(`/invoices/${invoiceId}/print`);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {toast.node}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/invoices" className="btn-ghost px-2">←</Link>
          <h1>{inv.number ?? t("newInvoice")}</h1>
          {inv.status && <span className={`badge ${statusStyle[inv.status]}`}>{t(`st_${inv.status}`)}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={preview} disabled={busy}>👁 {t("preview")}</button>
          {!locked && <button className="btn-primary" onClick={save} disabled={busy}>{t("saveInvoice")}</button>}
        </div>
      </div>

      <div className="card p-5 grid gap-4 sm:grid-cols-2">
        <Field label={t("client")}>
          <div className="flex gap-2">
            <select className="input" disabled={locked} value={inv.client_id ?? ""} onChange={(e) => setInv({ ...inv, client_id: e.target.value })}>
              <option value="">—</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {!locked && <button className="btn-secondary shrink-0" onClick={() => setNewClient(true)}>+</button>}
          </div>
        </Field>
        <Field label={t("jobSite")}>
          <select className="input" disabled={locked} value={inv.site_id ?? ""} onChange={(e) => {
            const s = sites.find((x) => x.id === e.target.value);
            setInv({ ...inv, site_id: e.target.value || null, job_address: s ? s.address : inv.job_address });
          }}>
            <option value="">—</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label={t("jobAddress")}><input className="input" disabled={locked} value={inv.job_address ?? ""} onChange={(e) => setInv({ ...inv, job_address: e.target.value })} /></Field>
        <Field label={`${t("poNumber")} (${t("optional")})`}><input className="input" disabled={locked} value={inv.po_number ?? ""} onChange={(e) => setInv({ ...inv, po_number: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("issueDate")}><input type="date" className="input" disabled={locked} value={inv.issue_date ?? ""} onChange={(e) => setInv({ ...inv, issue_date: e.target.value })} /></Field>
          <Field label={t("dueDate")}><input type="date" className="input" disabled={locked} value={inv.due_date ?? ""} onChange={(e) => setInv({ ...inv, due_date: e.target.value })} /></Field>
        </div>
        <Field label={t("invoiceLang")}>
          <select className="input" disabled={locked} value={inv.language} onChange={(e) => setInv({ ...inv, language: e.target.value as Lang })}>
            <option value="en">English</option><option value="pt">Português</option>
          </select>
        </Field>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3"><h2>{t("items")}</h2></div>
        <div className="divide-y divide-slate-100">
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 px-4 py-3">
              <textarea rows={1} className="input col-span-12 sm:col-span-6" disabled={locked} placeholder={t("description")}
                value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} />
              <input className="input col-span-3 sm:col-span-1" type="number" step="0.01" disabled={locked} aria-label={t("qty")} title={t("qty")}
                value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
              <input className="input col-span-3 sm:col-span-1" disabled={locked} placeholder={t("unit")} title="hr, sqft, ea…"
                value={it.unit ?? ""} onChange={(e) => updateItem(idx, { unit: e.target.value })} />
              <input className="input col-span-3 sm:col-span-2" type="number" step="0.01" disabled={locked} aria-label={t("unitPrice")} title={t("unitPrice")}
                value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })} />
              <div className="col-span-3 sm:col-span-2 flex items-center justify-end gap-1 text-sm font-semibold">
                {money(Number(it.quantity) * Number(it.unit_price), lang, cur)}
                {!locked && (
                  <span className="ml-1 flex flex-col text-[10px] leading-none text-slate-400">
                    <button onClick={() => moveItem(idx, -1)}>▲</button><button onClick={() => moveItem(idx, 1)}>▼</button>
                  </span>
                )}
                {!locked && <button className="ml-1 text-red-500" onClick={() => setItems(items.filter((_, i) => i !== idx))} aria-label="remove">✕</button>}
              </div>
            </div>
          ))}
        </div>
        {!locked && (
          <div className="px-4 py-3">
            <button className="btn-secondary" onClick={() => setItems([...items, emptyItem(items.length)])}>+ {t("addItem")}</button>
          </div>
        )}
        <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-4">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between"><span>{t("subtotal")}</span><span>{money(subtotal, lang, cur)}</span></div>
            <div className="flex items-center justify-between gap-2">
              <span>{t("discount")}</span>
              <input className="input w-28 py-1 text-right" type="number" step="0.01" min="0" disabled={locked} value={inv.discount ?? 0} onChange={(e) => setInv({ ...inv, discount: Number(e.target.value) })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>{t("taxRate")}</span>
              <input className="input w-28 py-1 text-right" type="number" step="0.001" min="0" disabled={locked} value={inv.tax_rate ?? 0} onChange={(e) => setInv({ ...inv, tax_rate: Number(e.target.value) })} />
            </div>
            {tax > 0 && <div className="flex justify-between"><span>{t("tax")}</span><span>{money(tax, lang, cur)}</span></div>}
            <div className="flex justify-between border-t border-slate-300 pt-2 text-base font-bold"><span>{t("total")}</span><span>{money(total, lang, cur)}</span></div>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <Field label={t("notes")}><textarea className="input" rows={3} disabled={locked} value={inv.notes ?? ""} onChange={(e) => setInv({ ...inv, notes: e.target.value })} /></Field>
      </div>

      {inv.id && (
        <div className="card p-5 space-y-3">
          <div className="flex flex-wrap gap-2">
            {inv.status === "draft" && <button className="btn-secondary" onClick={() => setStatus("sent")}>✉ {t("markSent")}</button>}
            {(inv.status === "draft" || inv.status === "sent") && <button className="btn bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setStatus("paid")}>✓ {t("markPaid")}</button>}
            {inv.status !== "draft" && inv.status !== "void" && <button className="btn-secondary" onClick={() => setStatus("draft")}>{t("markDraft")}</button>}
            {inv.status !== "void" && inv.status !== "paid" && <button className="btn-ghost text-slate-500" onClick={() => setStatus("void")}>{t("markVoid")}</button>}
            <button className="btn-ghost" onClick={duplicate}>{t("duplicate")}</button>
            {(inv.status === "draft" || isDeveloper) && <button className="btn-ghost text-red-600" onClick={remove}>{t("delete")}</button>}
          </div>
          <p className="text-xs text-slate-500">{t("paidHint")}</p>
        </div>
      )}

      {newClient && <ClientForm client={{}} onClose={() => setNewClient(false)} onSaved={(c) => { setClients([...clients, c]); setInv({ ...inv, client_id: c.id }); setNewClient(false); }} />}
    </div>
  );
}
