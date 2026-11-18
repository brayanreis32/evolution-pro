import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { addDays, fmtDate, fmtDateTime, fmtTime, hours, mapsLink, money, weekRange } from "../../lib/format";
import { LONG_SHIFT_HOURS, useLive } from "../../lib/live";
import PayModal from "./PayModal";
import type { JobSite, PayrollPayment, PayrollRow, Profile, Punch, PunchType, Session } from "../../lib/types";
import { downloadCsv, Empty, Field, Modal, PageHeader, PeriodPicker, Stat, useToast, type Period } from "../../components/ui";

const toLocalInput = (ts: string) => {
  const d = new Date(ts);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function PunchForm({ employeeId, punch, sites, onClose, onSaved }: {
  employeeId: string; punch: Partial<Punch> | null; sites: JobSite[]; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [type, setType] = useState<PunchType>(punch?.punch ?? "clock_in");
  const [when, setWhen] = useState(toLocalInput(punch?.punched_at ?? new Date().toISOString()));
  const [site, setSite] = useState(punch?.site_id ?? sites[0]?.id ?? "");
  const [note, setNote] = useState(punch?.note ?? "");
  const [err, setErr] = useState("");

  const save = async () => {
    const row = { employee_id: employeeId, punch: type, punched_at: new Date(when).toISOString(), site_id: site || null, note: note || null, edited_by: profile!.id };
    const { error } = punch?.id ? await supabase.from("time_punches").update(row).eq("id", punch.id) : await supabase.from("time_punches").insert(row);
    if (error) setErr(error.message); else onSaved();
  };
  const remove = async () => {
    if (!punch?.id || !confirm(t("confirmDelete"))) return;
    await supabase.from("time_punches").delete().eq("id", punch.id);
    onSaved();
  };

  return (
    <Modal title={punch?.id ? t("edit") : t("addPunch")} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("punchType")}>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as PunchType)}>
              {(["clock_in", "break_start", "break_end", "clock_out"] as const).map((p) => <option key={p} value={p}>{t(`p_${p}`)}</option>)}
            </select>
          </Field>
          <Field label={t("time")}><input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        </div>
        <Field label={t("jobSite")}>
          <select className="input" value={site} onChange={(e) => setSite(e.target.value)}>
            <option value="">—</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label={t("notes")}><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-between gap-2">
          {punch?.id ? <button className="btn-ghost text-red-600" onClick={remove}>{t("delete")}</button> : <span />}
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>{t("cancel")}</button>
            <button className="btn-primary" onClick={save}>{t("save")}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function EmployeeDetail({ row, period, sites, onClose, onChanged }: {
  row: PayrollRow; period: Period; sites: JobSite[]; onClose: () => void; onChanged: () => void;
}) {
  const { t, lang } = useI18n();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [editing, setEditing] = useState<Partial<Punch> | null>(null);
  const [audit, setAudit] = useState<{ id: number; action: string; old_data: Partial<Punch> | null; new_data: Partial<Punch> | null; changed_by: string | null; changed_at: string }[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const siteName = (id: string | null) => sites.find((s) => s.id === id)?.name ?? "—";

  const load = async () => {
    const s = await supabase.rpc("work_sessions", { p_start: period.start, p_end: period.end, p_employee: row.employee_id });
    const ss = (s.data ?? []) as Session[];
    // batidas do período + as dos turnos que começaram antes ou terminaram depois dele
    let from = new Date(period.start + "T00:00:00");
    let to = new Date(addDays(period.end, 1) + "T00:00:00");
    for (const x of ss) {
      if (new Date(x.clock_in) < from) from = new Date(x.clock_in);
      if (x.clock_out && new Date(x.clock_out) >= to) to = new Date(new Date(x.clock_out).getTime() + 1000);
    }
    const [p, a] = await Promise.all([
      supabase.from("time_punches").select("*").eq("employee_id", row.employee_id)
        .gte("punched_at", from.toISOString()).lt("punched_at", to.toISOString()).order("punched_at"),
      supabase.from("time_punch_audit").select("*").eq("employee_id", row.employee_id).order("changed_at", { ascending: false }).limit(100),
    ]);
    setSessions(ss);
    setPunches((p.data ?? []) as Punch[]);
    setAudit((a.data ?? []) as typeof audit);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLive(["time_punches"], load);
  const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

  return (
    <Modal title={row.full_name} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>{t("date")}</th><th>{t("jobSite")}</th><th>{t("clockIn")}</th><th>{t("clockOut")}</th><th>{t("breakCol")}</th><th className="text-right">{t("worked")}</th></tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.clock_in}>
                  <td>{fmtDate(s.work_date, lang)}</td><td>{siteName(s.site_id)}</td>
                  <td>{fmtTime(s.clock_in, lang)}</td>
                  <td>{s.is_open ? <span className="badge bg-amber-100 text-amber-800">{t("open")}</span> : (s.clock_out && !sameDay(s.clock_in, s.clock_out) ? fmtDateTime(s.clock_out, lang) : fmtTime(s.clock_out, lang))}</td>
                  <td>{hours(s.break_minutes)}</td><td className="text-right font-medium">{hours(s.worked_minutes)}</td>
                </tr>
              ))}
              {!sessions.length && <tr><td colSpan={6}><Empty /></td></tr>}
            </tbody>
          </table>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2>{t("punches")}</h2>
            <button className="btn-secondary" onClick={() => setEditing({})}>+ {t("addPunch")}</button>
          </div>
          <ul className="divide-y divide-slate-100 text-sm">
            {punches.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <span className="font-medium">{t(`p_${p.punch}`)}</span> · {fmtDateTime(p.punched_at, lang)}
                  <div className="text-xs text-slate-500">
                    {siteName(p.site_id)}
                    {p.distance_m != null && <> · {Math.round(p.distance_m)} m</>}
                    {p.latitude != null && <> · <a className="underline" target="_blank" rel="noreferrer" href={mapsLink(p.latitude, p.longitude!)}>GPS</a></>}
                    {p.edited_by && <> · <span className="text-amber-600">{t("editedByAdmin")}</span></>}
                    {p.note && <> · {p.note}</>}
                  </div>
                </div>
                <button className="btn-ghost px-2" onClick={() => setEditing(p)}>{t("edit")}</button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <button className="text-sm font-medium text-brand-600" onClick={() => setShowAudit(!showAudit)}>
            {showAudit ? "▾" : "▸"} {t("history")} ({audit.length})
          </button>
          {showAudit && (
            <ul className="mt-2 divide-y divide-slate-100 text-xs text-slate-600">
              {audit.map((h) => {
                const before = h.old_data, after = h.new_data;
                const label = (d: Partial<Punch> | null) => d ? `${t(`p_${d.punch}` as "p_clock_in")} ${d.punched_at ? fmtDateTime(d.punched_at, lang) : ""}` : "";
                return (
                  <li key={h.id} className="py-1.5">
                    <span className="font-medium">{fmtDateTime(h.changed_at, lang)}</span> ·{" "}
                    {h.action === "insert" && <>+ {label(after)}</>}
                    {h.action === "update" && <>{label(before)} → {label(after)}</>}
                    {h.action === "delete" && <span className="text-red-600">✕ {label(before)}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {editing && (
        <PunchForm employeeId={row.employee_id} punch={editing} sites={sites}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); onChanged(); }} />
      )}
    </Modal>
  );
}

export default function Timesheets() {
  const { t, lang } = useI18n();
  const { company } = useAuth();
  const toast = useToast();
  const [period, setPeriod] = useState<Period>(weekRange());
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [sites, setSites] = useState<JobSite[]>([]);
  const [detail, setDetail] = useState<PayrollRow | null>(null);
  const [paying, setPaying] = useState<PayrollRow | null>(null);
  const [payments, setPayments] = useState<PayrollPayment[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);

  const [longOpen, setLongOpen] = useState<{ employee_id: string; clock_in: string; open_hours: number }[]>([]);
  const load = () => {
    supabase.rpc("payroll_summary", { p_start: period.start, p_end: period.end })
      .then(({ data }) => setRows((data ?? []) as PayrollRow[]));
    supabase.from("payroll_payments").select("*").eq("period_start", period.start).eq("period_end", period.end)
      .then(({ data }) => setPayments((data ?? []) as PayrollPayment[]));
    supabase.from("profiles").select("*").then(({ data }) => setPeople((data ?? []) as Profile[]));
    supabase.rpc("open_shifts").then(({ data }) =>
      setLongOpen(((data ?? []) as { employee_id: string; clock_in: string; open_hours: number }[]).filter((o) => Number(o.open_hours) > LONG_SHIFT_HOURS)));
  };
  useEffect(() => { load(); }, [period]); // eslint-disable-line react-hooks/exhaustive-deps
  useLive(["time_punches", "payroll_payments"], load);
  useEffect(() => { supabase.from("job_sites").select("*").order("name").then(({ data }) => setSites((data ?? []) as JobSite[])); }, []);

  const totalHours = rows.reduce((s, r) => s + Number(r.hours), 0);
  const totalPay = rows.reduce((s, r) => s + Number(r.amount), 0);
  const openCount = rows.reduce((s, r) => s + Number(r.open_shifts), 0);

  const paidTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
  const paymentOf = (id: string) => payments.find((p) => p.employee_id === id);
  const undo = async (p: PayrollPayment) => {
    if (!confirm(t("confirmUndo"))) return;
    const { error } = await supabase.rpc("undo_payroll_payment", { p_id: p.id });
    if (error) toast.fail(error.message); else load();
  };

  const exportCsv = () => downloadCsv(`payroll_${period.start}_${period.end}.csv`, [
    [t("name"), t("shifts"), t("hours"), t("rate"), t("toPay")],
    ...rows.map((r) => [r.full_name, r.shifts, r.hours, r.hourly_rate, r.amount]),
  ]);

  return (
    <div className="space-y-5">
      {toast.node}
      <PageHeader title={t("payroll")}>
        <button className="btn-secondary" onClick={exportCsv}>{t("exportCsv")}</button>
      </PageHeader>
      <PeriodPicker value={period} onChange={setPeriod} />
      {longOpen.length > 0 && (
        <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <b>⚠ {t("openShifts")}:</b>{" "}
          {longOpen.map((o) => (
            <span key={o.employee_id} className="mr-3">
              {rows.find((r) => r.employee_id === o.employee_id)?.full_name ?? "—"} — {t("since")} {fmtDateTime(o.clock_in, lang)} ({t("longShift", { h: Math.floor(Number(o.open_hours)) })})
            </span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Stat label={t("hours")} value={totalHours.toFixed(2)} />
        <Stat label={t("toPay")} value={money(totalPay, lang, company?.currency)} />
        <Stat label={t("payrollPaid")} value={money(paidTotal, lang, company?.currency)} tone={paidTotal > 0 ? "good" : "default"} />
        {openCount > 0 && <Stat label={t("open")} value={String(openCount)} sub={t("openShiftWarn")} tone="bad" />}
      </div>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty /> : (
          <table className="table">
            <thead><tr><th>{t("name")}</th><th className="text-right">{t("shifts")}</th><th className="text-right">{t("hours")}</th><th className="text-right">{t("rate")}</th><th className="text-right">{t("toPay")}</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employee_id} className="hover:bg-slate-50">
                  <td className="font-medium">
                    {r.full_name}
                    {r.open_shifts > 0 && <span className="badge ml-2 bg-amber-100 text-amber-800">{r.open_shifts} {t("open")}</span>}
                  </td>
                  <td className="text-right">{r.shifts}</td>
                  <td className="text-right">{Number(r.hours).toFixed(2)}</td>
                  <td className="text-right">{money(r.hourly_rate, lang, company?.currency)}</td>
                  <td className="text-right font-semibold">{money(r.amount, lang, company?.currency)}</td>
                  <td className="whitespace-nowrap text-right">
                    <button className="btn-ghost px-2" onClick={() => setDetail(r)}>{t("details")}</button>
                    {(() => {
                      const pp = paymentOf(r.employee_id);
                      if (pp) return (
                        <span className="ml-1 inline-flex items-center gap-2">
                          <span className="badge bg-emerald-100 text-emerald-800">✓ {t("paidOn", { date: fmtDate(pp.paid_at.slice(0, 10), lang) })} · {money(pp.amount, lang, company?.currency)}</span>
                          <button className="text-xs text-slate-500 hover:underline" onClick={() => undo(pp)}>{t("undoPayment")}</button>
                        </span>
                      );
                      return (r.amount > 0 || r.open_shifts > 0) && (
                        <button className="btn ml-1 bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700" onClick={() => setPaying(r)}>$ {t("pay")}</button>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {detail && <EmployeeDetail row={detail} period={period} sites={sites} onClose={() => setDetail(null)} onChanged={load} />}
      {paying && !detail && (
        <PayModal row={paying} period={period} sites={sites} employee={people.find((p) => p.id === paying.employee_id) ?? null}
          onClose={() => setPaying(null)}
          onPaid={() => { setPaying(null); toast.ok(t("paymentDone")); load(); }}
          onFix={() => setDetail(paying)} />
      )}
    </div>
  );
}
