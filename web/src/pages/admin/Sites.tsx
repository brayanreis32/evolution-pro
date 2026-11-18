import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useErrorText, useI18n } from "../../lib/i18n";
import { geocode, getPosition } from "../../lib/geo";
import { fmtDate, mapsLink, today, weekRange } from "../../lib/format";
import type { Assignment, JobSite, Profile } from "../../lib/types";
import { Empty, Field, Modal, PageHeader, useToast } from "../../components/ui";

export function MapPreview({ lat, lng, radius }: { lat: number; lng: number; radius: number }) {
  const d = Math.max(radius / 111000 * 2.5, 0.002);
  const bbox = [lng - d * 1.4, lat - d, lng + d * 1.4, lat + d].join(",");
  return (
    <iframe
      title="map"
      className="h-48 w-full rounded-lg border border-slate-200"
      src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`}
    />
  );
}

const blank = { name: "", address: "", latitude: NaN, longitude: NaN, radius_m: 150, active: true, notes: "" };

function SiteForm({ site, onClose, onSaved }: { site: Partial<JobSite> | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const errText = useErrorText();
  const [f, setF] = useState({ ...blank, ...site });
  const [results, setResults] = useState<{ label: string; lat: number; lng: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const hasCoords = Number.isFinite(f.latitude) && Number.isFinite(f.longitude);

  const search = async () => {
    setBusy(true); setErr("");
    try {
      const r = await geocode(f.address);
      if (r.length === 1) { setF({ ...f, latitude: r[0].lat, longitude: r[0].lng }); setResults(null); }
      else setResults(r);
      if (!r.length) setErr(t("noResults"));
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  const useMine = async () => {
    setBusy(true); setErr("");
    try { const p = await getPosition(); setF({ ...f, latitude: p.lat, longitude: p.lng }); }
    catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  const save = async () => {
    if (!f.name || !f.address || !hasCoords) { setErr(t("needCoords")); return; }
    setBusy(true);
    const row = { name: f.name, address: f.address, latitude: f.latitude, longitude: f.longitude, radius_m: f.radius_m, active: f.active, notes: f.notes || null };
    const { error } = f.id ? await supabase.from("job_sites").update(row).eq("id", f.id) : await supabase.from("job_sites").insert(row);
    setBusy(false);
    if (error) setErr(error.message); else onSaved();
  };

  return (
    <Modal title={f.id ? f.name : t("newSite")} onClose={onClose}>
      <div className="space-y-4">
        <Field label={t("name")}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Casa Johnson — Kitchen" /></Field>
        <Field label={t("address")}>
          <div className="flex gap-2">
            <input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())} placeholder="123 Main St, Orlando, FL" />
            <button className="btn-secondary shrink-0" onClick={search} disabled={busy || !f.address}>{t("search")}</button>
          </div>
        </Field>
        {results && results.length > 1 && (
          <div className="space-y-1">
            <div className="label">{t("pickResult")}</div>
            {results.map((r) => (
              <button key={r.label} className="block w-full rounded-lg border border-slate-200 p-2 text-left text-xs hover:bg-slate-50"
                onClick={() => { setF({ ...f, latitude: r.lat, longitude: r.lng }); setResults(null); }}>{r.label}</button>
            ))}
          </div>
        )}
        <button className="btn-ghost w-full border border-dashed border-slate-300" onClick={useMine} disabled={busy}>⌖ {t("useMyLocation")}</button>
        {hasCoords && <MapPreview lat={f.latitude} lng={f.longitude} radius={f.radius_m} />}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("latitude")}><input className="input" type="number" step="any" value={Number.isFinite(f.latitude) ? f.latitude : ""} onChange={(e) => setF({ ...f, latitude: parseFloat(e.target.value) })} /></Field>
          <Field label={t("longitude")}><input className="input" type="number" step="any" value={Number.isFinite(f.longitude) ? f.longitude : ""} onChange={(e) => setF({ ...f, longitude: parseFloat(e.target.value) })} /></Field>
        </div>
        <Field label={`${t("radius")}: ${f.radius_m} m`}>
          <input type="range" min={25} max={1000} step={25} className="w-full" value={f.radius_m} onChange={(e) => setF({ ...f, radius_m: Number(e.target.value) })} />
          <span className="text-xs text-slate-500">{t("radiusHint")}</span>
        </Field>
        <Field label={t("notes")}><textarea className="input" rows={2} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />{t("siteActive")}</label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>{t("cancel")}</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{t("save")}</button>
        </div>
      </div>
    </Modal>
  );
}

function AssignForm({ site, employees, onClose, onSaved }: { site: JobSite; employees: Profile[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const wk = weekRange();
  const [emp, setEmp] = useState<string>("all");
  const [start, setStart] = useState(wk.start < today() ? today() : wk.start);
  const [end, setEnd] = useState(wk.end);
  const [err, setErr] = useState("");

  const save = async () => {
    const ids = emp === "all" ? employees.map((e) => e.id) : [emp];
    const { error } = await supabase.from("site_assignments").insert(ids.map((id) => ({ site_id: site.id, employee_id: id, start_date: start, end_date: end })));
    if (error) setErr(error.message); else onSaved();
  };

  return (
    <Modal title={`${t("assign")} — ${site.name}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label={t("employee")}>
          <select className="input" value={emp} onChange={(e) => setEmp(e.target.value)}>
            <option value="all">— {t("assignAll")} —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("startDate")}><input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label={t("endDate")}><input type="date" className="input" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>{t("cancel")}</button>
          <button className="btn-primary" onClick={save} disabled={!employees.length}>{t("assign")}</button>
        </div>
      </div>
    </Modal>
  );
}

export default function Sites() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [sites, setSites] = useState<JobSite[]>([]);
  const [assign, setAssign] = useState<Assignment[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [editing, setEditing] = useState<Partial<JobSite> | null>(null);
  const [assigning, setAssigning] = useState<JobSite | null>(null);

  const load = async () => {
    const [s, a, e] = await Promise.all([
      supabase.from("job_sites").select("*").order("active", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("site_assignments").select("*").gte("end_date", today()).order("start_date"),
      supabase.from("profiles").select("*").eq("active", true).eq("role", "employee").order("full_name"),
    ]);
    setSites((s.data ?? []) as JobSite[]);
    setAssign((a.data ?? []) as Assignment[]);
    setEmployees((e.data ?? []) as Profile[]);
  };
  useEffect(() => { load(); }, []);

  const removeAssign = async (id: string) => {
    await supabase.from("site_assignments").delete().eq("id", id);
    load();
  };
  const removeSite = async (s: JobSite) => {
    if (!confirm(t("confirmDelete"))) return;
    const { error } = await supabase.from("job_sites").delete().eq("id", s.id);
    if (error) toast.fail(error.message); else load();
  };
  const empName = (id: string) => employees.find((e) => e.id === id)?.full_name ?? "—";

  return (
    <div>
      {toast.node}
      <PageHeader title={t("navSites")}>
        <button className="btn-primary" onClick={() => setEditing({})}>+ {t("newSite")}</button>
      </PageHeader>
      {sites.length === 0 ? <div className="card"><Empty /></div> : (
        <div className="grid gap-4 xl:grid-cols-2">
          {sites.map((s) => {
            const list = assign.filter((a) => a.site_id === s.id);
            return (
              <div key={s.id} className={`card p-5 space-y-3 ${s.active ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2>{s.name}</h2>
                    <a href={mapsLink(s.latitude, s.longitude)} target="_blank" rel="noreferrer" className="text-sm text-brand-600 underline">{s.address}</a>
                    <div className="text-xs text-slate-500">{t("radius")}: {s.radius_m} m</div>
                  </div>
                  <div className="flex gap-1">
                    <button className="btn-ghost px-2" onClick={() => setEditing(s)}>{t("edit")}</button>
                    <button className="btn-ghost px-2 text-red-600" onClick={() => removeSite(s)}>{t("delete")}</button>
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="label mb-0">{t("assignments")}</span>
                    {s.active && <button className="text-xs font-semibold text-brand-600" onClick={() => setAssigning(s)}>+ {t("assign")}</button>}
                  </div>
                  {list.length === 0 ? <p className="text-sm text-slate-400">{t("noAssignments")}</p> : (
                    <ul className="divide-y divide-slate-100 text-sm">
                      {list.map((a) => (
                        <li key={a.id} className="flex items-center justify-between py-1.5">
                          <span className="font-medium">{empName(a.employee_id)}</span>
                          <span className="flex items-center gap-2 text-slate-500">
                            {fmtDate(a.start_date, lang)} → {fmtDate(a.end_date, lang)}
                            <button className="text-red-500" onClick={() => removeAssign(a.id)} aria-label="remove">✕</button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {editing && <SiteForm site={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast.ok(t("saved")); load(); }} />}
      {assigning && <AssignForm site={assigning} employees={employees} onClose={() => setAssigning(null)} onSaved={() => { setAssigning(null); load(); }} />}
    </div>
  );
}
