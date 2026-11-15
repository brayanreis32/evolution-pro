import { useEffect, useMemo, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { callFunction, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { fmtDate, fmtDateTime, money, monthRange, today } from "../../lib/format";
import type { BankAccount, Category, Transaction, TxnKind } from "../../lib/types";
import { downloadCsv, Empty, Field, Modal, PageHeader, PeriodPicker, Stat, useToast, type Period } from "../../components/ui";

function TxnForm({ txn, categories, accounts, onClose, onSaved }: {
  txn: Partial<Transaction>; categories: Category[]; accounts: BankAccount[]; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  const [f, setF] = useState<Partial<Transaction>>({ kind: "expense", txn_date: today(), ...txn });
  const [err, setErr] = useState("");
  const locked = f.source === "plaid" || f.source === "invoice"; // valor/data vêm do banco ou do invoice

  const save = async () => {
    const row = {
      txn_date: f.txn_date, description: f.description, amount: Number(f.amount), kind: f.kind,
      category_id: f.category_id || null, account_id: f.account_id || null, notes: f.notes || null,
    };
    const { error } = f.id ? await supabase.from("transactions").update(row).eq("id", f.id) : await supabase.from("transactions").insert(row);
    if (error) setErr(error.message); else onSaved();
  };
  const remove = async () => {
    if (!confirm(t("confirmDelete"))) return;
    await supabase.from("transactions").delete().eq("id", f.id!);
    onSaved();
  };

  return (
    <Modal title={f.id ? t("edit") : t("addTxn")} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(["income", "expense"] as TxnKind[]).map((k) => (
            <button key={k} disabled={locked}
              className={`btn py-3 ${f.kind === k ? (k === "income" ? "bg-emerald-600 text-white" : "bg-red-600 text-white") : "btn-secondary"}`}
              onClick={() => setF({ ...f, kind: k, category_id: null })}>
              {k === "income" ? `↑ ${t("kindIncome")}` : `↓ ${t("kindExpense")}`}
            </button>
          ))}
        </div>
        <Field label={t("description")}><input className="input" value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("amount")}><input className="input" type="number" step="0.01" min="0" disabled={locked} value={f.amount ?? ""} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></Field>
          <Field label={t("date")}><input className="input" type="date" disabled={locked} value={f.txn_date} onChange={(e) => setF({ ...f, txn_date: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("category")}>
            <select className="input" value={f.category_id ?? ""} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
              <option value="">{t("uncategorized")}</option>
              {categories.filter((c) => c.kind === f.kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label={t("account")}>
            <select className="input" value={f.account_id ?? ""} disabled={locked} onChange={(e) => setF({ ...f, account_id: e.target.value })}>
              <option value="">{t("cashAccount")}</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.mask ? ` ••${a.mask}` : ""}</option>)}
            </select>
          </Field>
        </div>
        <Field label={t("notes")}><input className="input" value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-between">
          {f.id && f.source !== "invoice" ? <button className="btn-ghost text-red-600" onClick={remove}>{t("delete")}</button> : <span />}
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>{t("cancel")}</button>
            <button className="btn-primary" onClick={save} disabled={!f.description || !f.amount}>{t("save")}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ConnectBank({ onDone, onError }: { onDone: (msg: string) => void; onError: (msg: string) => void }) {
  const { t, lang } = useI18n();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { open, ready } = usePlaidLink({
    token,
    onSuccess: async (public_token, metadata) => {
      setBusy(true);
      try {
        const r = await callFunction("plaid-exchange", { public_token, institution_name: metadata.institution?.name });
        onDone(t("syncDone", { added: r.added, modified: r.modified }));
      } catch (e) { onError((e as Error).message); } finally { setBusy(false); setToken(null); }
    },
    onExit: () => setToken(null),
  });

  useEffect(() => { if (token && ready) open(); }, [token, ready, open]);

  const start = async () => {
    setBusy(true);
    try { setToken((await callFunction("plaid-link-token", { language: lang })).link_token); }
    catch (e) { onError((e as Error).message); }
    finally { setBusy(false); }
  };

  return <button className="btn-primary" onClick={start} disabled={busy}>🏦 {busy ? t("loading") : t("connectBank")}</button>;
}

export default function Finance() {
  const { t, lang } = useI18n();
  const { company } = useAuth();
  const toast = useToast();
  const cur = company?.currency ?? "USD";
  const [period, setPeriod] = useState<Period>(monthRange());
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [editing, setEditing] = useState<Partial<Transaction> | null>(null);
  const [kind, setKind] = useState<"" | TxnKind>("");
  const [catFilter, setCatFilter] = useState("");
  const [q, setQ] = useState("");
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    const [tx, c, a] = await Promise.all([
      supabase.from("transactions").select("*").gte("txn_date", period.start).lte("txn_date", period.end).order("txn_date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("categories").select("*").order("name"),
      supabase.from("bank_accounts").select("*").order("name"),
    ]);
    setTxns((tx.data ?? []) as Transaction[]);
    setCats((c.data ?? []) as Category[]);
    setAccounts((a.data ?? []) as BankAccount[]);
  };
  useEffect(() => { load(); }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await callFunction("plaid-sync");
      const added = r.results.reduce((s: number, x: any) => s + (x.added ?? 0), 0);
      const modified = r.results.reduce((s: number, x: any) => s + (x.modified ?? 0), 0);
      toast.ok(t("syncDone", { added, modified }));
      load();
    } catch (e) { toast.fail((e as Error).message); } finally { setSyncing(false); }
  };

  const setCategory = async (id: string, category_id: string) => {
    await supabase.from("transactions").update({ category_id: category_id || null }).eq("id", id);
    setTxns((xs) => xs.map((x) => (x.id === id ? { ...x, category_id: category_id || null } : x)));
  };

  const filtered = useMemo(() => txns.filter((x) =>
    (!kind || x.kind === kind) &&
    (!catFilter || (catFilter === "none" ? !x.category_id : x.category_id === catFilter)) &&
    (!q || x.description.toLowerCase().includes(q.toLowerCase()))), [txns, kind, catFilter, q]);

  const income = txns.filter((x) => x.kind === "income").reduce((s, x) => s + Number(x.amount), 0);
  const expense = txns.filter((x) => x.kind === "expense").reduce((s, x) => s + Number(x.amount), 0);

  const byCat = useMemo(() => {
    const m = new Map<string, { name: string; color: string; total: number }>();
    for (const x of txns.filter((x) => x.kind === "expense")) {
      const c = cats.find((c) => c.id === x.category_id);
      const k = c?.id ?? "none";
      const cur = m.get(k) ?? { name: c?.name ?? t("uncategorized"), color: c?.color ?? "#94a3b8", total: 0 };
      cur.total += Number(x.amount);
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [txns, cats, t]);

  const accName = (id: string | null) => { const a = accounts.find((a) => a.id === id); return a ? `${a.name}${a.mask ? ` ••${a.mask}` : ""}` : t("cashAccount"); };
  const srcLabel = { manual: t("srcManual"), plaid: t("srcPlaid"), invoice: t("srcInvoice") };

  const exportCsv = () => downloadCsv(`transactions_${period.start}_${period.end}.csv`, [
    [t("date"), t("description"), t("kind"), t("category"), t("account"), t("amount"), t("source")],
    ...filtered.map((x) => [x.txn_date, x.description, x.kind === "income" ? t("kindIncome") : t("kindExpense"),
      cats.find((c) => c.id === x.category_id)?.name ?? "", accName(x.account_id), x.kind === "income" ? x.amount : -x.amount, srcLabel[x.source]]),
  ]);

  return (
    <div className="space-y-5">
      {toast.node}
      <PageHeader title={t("navFinance")}>
        <button className="btn-secondary" onClick={exportCsv}>{t("exportCsv")}</button>
        <button className="btn-primary" onClick={() => setEditing({})}>+ {t("addTxn")}</button>
      </PageHeader>

      <PeriodPicker value={period} onChange={setPeriod} mode="month" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={t("income")} value={money(income, lang, cur)} tone="good" />
        <Stat label={t("expense")} value={money(expense, lang, cur)} tone="bad" />
        <Stat label={t("net")} value={money(income - expense, lang, cur)} tone={income - expense >= 0 ? "good" : "bad"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* contas */}
        <div className="card p-5 space-y-3 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h2>{t("accounts")}</h2>
            {accounts.some((a) => a.plaid_item_id) && (
              <button className="btn-ghost px-2 text-xs" onClick={sync} disabled={syncing}>↻ {syncing ? t("loading") : t("sync")}</button>
            )}
          </div>
          {accounts.length === 0 && <p className="text-sm text-slate-500">{t("noAccounts")}</p>}
          {accounts.map((a) => (
            <div key={a.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{a.name}{a.mask && <span className="text-slate-400"> ••{a.mask}</span>}</span>
                <span className="font-semibold">{money(a.current_balance, lang, a.currency)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>{a.institution}</span>
                <span>{t("available")}: {money(a.available_balance, lang, a.currency)}</span>
              </div>
              <div className="text-[11px] text-slate-400">{t("lastSync")}: {fmtDateTime(a.updated_at, lang)}</div>
            </div>
          ))}
          <ConnectBank onDone={(m) => { toast.ok(m); load(); }} onError={toast.fail} />
          <p className="text-xs text-slate-500">{t("plaidHint")}</p>

          {byCat.length > 0 && (
            <div className="pt-3">
              <h2 className="mb-2">{t("byCategory")}</h2>
              <div className="space-y-2">
                {byCat.map((c) => (
                  <div key={c.name}>
                    <div className="flex justify-between text-xs"><span>{c.name}</span><span className="font-medium">{money(c.total, lang, cur)}</span></div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full" style={{ width: `${(c.total / byCat[0].total) * 100}%`, background: c.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* lançamentos */}
        <div className="card lg:col-span-2 overflow-hidden">
          <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3">
            <input className="input flex-1 min-w-[140px]" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value as "" | TxnKind)}>
              <option value="">{t("all")}</option><option value="income">{t("kindIncome")}</option><option value="expense">{t("kindExpense")}</option>
            </select>
            <select className="input w-auto" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="">{t("category")}: {t("all")}</option>
              <option value="none">{t("uncategorized")}</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {filtered.length === 0 ? <Empty /> : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${x.kind === "income" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {x.kind === "income" ? "↑" : "↓"}
                  </div>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(x)}>
                    <div className="truncate text-sm font-medium">{x.description}</div>
                    <div className="text-xs text-slate-500">
                      {fmtDate(x.txn_date, lang)} · {accName(x.account_id)} · {srcLabel[x.source]}
                      {x.pending && <> · <span className="text-amber-600">{t("pending")}</span></>}
                    </div>
                  </button>
                  <select className="hidden md:block input w-40 py-1 text-xs" value={x.category_id ?? ""} onChange={(e) => setCategory(x.id, e.target.value)}>
                    <option value="">{t("uncategorized")}</option>
                    {cats.filter((c) => c.kind === x.kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <div className={`w-24 text-right text-sm font-semibold ${x.kind === "income" ? "text-emerald-600" : "text-red-600"}`}>
                    {x.kind === "income" ? "+" : "−"}{money(x.amount, lang, cur)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editing && <TxnForm txn={editing} categories={cats} accounts={accounts} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}
