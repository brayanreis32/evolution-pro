import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "../lib/i18n";
import { monthRange, weekRange, halfMonthRange, addDays, today, parseDate, iso } from "../lib/format";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className={`card w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2>{title}</h2>
          <button className="btn-ghost px-2" onClick={onClose} aria-label="close">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Stat({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "good" | "bad" }) {
  const color = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-slate-900";
  return (
    <div className="card min-w-0 p-3 sm:p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:text-xs">{label}</div>
      <div className={`mt-1 break-words text-lg font-semibold leading-tight sm:text-2xl ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1>{title}</h1>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return <div className="p-8 text-center text-sm text-slate-500">{children ?? t("empty")}</div>;
}

export function Toast({ message, onDone, tone = "good" }: { message: string; onDone: () => void; tone?: "good" | "bad" }) {
  useEffect(() => {
    const id = setTimeout(onDone, 4000);
    return () => clearTimeout(id);
  }, [message, onDone]);
  return (
    <div className={`fixed bottom-20 lg:bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${tone === "good" ? "bg-emerald-600" : "bg-red-600"}`}>
      {message}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; tone: "good" | "bad" } | null>(null);
  const node = toast ? <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} /> : null;
  return {
    node,
    ok: (message: string) => setToast({ message, tone: "good" }),
    fail: (message: string) => setToast({ message, tone: "bad" }),
  };
}

export type Period = { start: string; end: string };

export function PeriodPicker({ value, onChange, mode = "week" }: { value: Period; onChange: (p: Period) => void; mode?: "week" | "month" | "report" }) {
  const { t } = useI18n();
  const lastMonth = (() => { const d = parseDate(today()); d.setDate(0); return monthRange(iso(d)); })();
  const presets: [string, Period][] = mode === "week"
    ? [[t("thisWeek"), weekRange()], [t("lastWeek"), weekRange(addDays(today(), -7))], [t("halfMonth"), halfMonthRange()], [t("thisMonth"), monthRange()]]
    : mode === "report"
    ? [[t("weekly"), weekRange()], [t("biweekly"), halfMonthRange()], [t("monthly"), monthRange()], [t("lastMonth"), lastMonth]]
    : [[t("thisMonth"), monthRange()], [t("lastMonth"), lastMonth], [t("halfMonth"), halfMonthRange()], [t("thisWeek"), weekRange()]];
  return (
    <div className="flex w-full min-w-0 flex-col gap-2 lg:w-auto lg:flex-row lg:flex-wrap lg:items-end">
      {/* celular: faixa que rola para o lado */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {presets.map(([label, p]) => (
          <button key={label} className={`shrink-0 rounded-full ${value.start === p.start && value.end === p.end ? "btn-primary" : "btn-secondary"}`} onClick={() => onChange(p)}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 lg:flex">
        <input type="date" className="input min-w-0 px-2 lg:w-auto lg:px-3" value={value.start} onChange={(e) => onChange({ ...value, start: e.target.value })} />
        <span className="text-slate-400">→</span>
        <input type="date" className="input min-w-0 px-2 lg:w-auto lg:px-3" value={value.end} onChange={(e) => onChange({ ...value, end: e.target.value })} />
      </div>
    </div>
  );
}

export function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs font-semibold">
      {(["pt", "en"] as const).map((l) => (
        <button key={l} onClick={() => setLang(l)} className={`rounded-md px-2 py-1 ${lang === l ? "bg-brand-700 text-white" : "text-slate-600"}`}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
