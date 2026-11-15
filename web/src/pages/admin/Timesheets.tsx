import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { addDays, fmtDate, fmtDateTime, fmtTime, hours, mapsLink, money, today, weekRange } from "../../lib/format";
import type { JobSite, PayrollRow, Punch, PunchType, Session } from "../../lib/types";
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
  const siteName = (id: string | null) => sites.find((s) => s.id === id)?.name ?? "—";

  const load = async () => {
    const [s, p] = await Promise.all([
      supabase.rpc("work_sessions", { p_start: period.start, p_end: period.end, p_employee: row.employee_id }),
      supabase.from("time_punches").select("*").eq("employee_id", row.employee_id)
        .gte("punched_at", new Date(period.start + "T00:00:00").toISOString())
        .lt("punched_at", new Date(addDays(period.end, 1) + "T00:00:00").toISOString()).order("punched_at"),
    ]);
    setSessions((s.data ?? []) as Session[]);
    setPunches((p.data ?? []) as Punch[]);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
                  <td>{s.is_open ? <span className="badge bg-amber-100 text-amber-800">{t("open")}</span> : fmtTime(s.clock_out, lang)}</td>
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

  const load = () => supabase.rpc("payroll_summary", { p_start: period.start, p_end: period.end })
    .then(({ data }) => setRows((data ?? []) as PayrollRow[]));
  useEffect(() => { load(); }, [period]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { supabase.from("job_sites").select("*").order("name").then(({ data }) => setSites((data ?? []) as JobSite[])); }, []);

  const totalHours = rows.reduce((s, r) => s + Number(r.hours), 0);
  const totalPay = rows.reduce((s, r) => s + Number(r.amount), 0);
  const openCount = rows.reduce((s, r) => s + Number(r.open_shifts), 0);

  const recordPayment = async (r: PayrollRow) => {
    const { data: cat } = await supabase.from("categories").select("id").eq("name", "Folha de pagamento").eq("kind", "expense").maybeSingle();
    const { error } = await supabase.from("transactions").insert({
      txn_date: today(), kind: "expense", amount: r.amount, category_id: cat?.id ?? null,
      description: `${t("payroll")} — ${r.full_name} (${fmtDate(period.start, lang)} – ${fmtDate(period.end, lang)}, ${r.hours}h)`,
    });
    if (error) toast.fail(error.message); else toast.ok(t("paymentRecorded"));
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={t("hours")} value={totalHours.toFixed(2)} />
        <Stat label={t("toPay")} value={money(totalPay, lang, company?.currency)} />
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
                    {r.amount > 0 && <button className="btn-ghost px-2" title={t("payAsExpense")} onClick={() => recordPayment(r)}>$ {t("payAsExpense")}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {detail && <EmployeeDetail row={detail} period={period} sites={sites} onClose={() => setDetail(null)} onChanged={load} />}
    </div>
  );
}
