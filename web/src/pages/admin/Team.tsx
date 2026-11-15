import { useEffect, useState } from "react";
import { callFunction, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useErrorText, useI18n } from "../../lib/i18n";
import { money } from "../../lib/format";
import type { Profile } from "../../lib/types";
import { Empty, Field, Modal, PageHeader, useToast } from "../../components/ui";

function NewEmployee({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState({ full_name: "", email: "", phone: "", password: "", hourly_rate: "", language: "pt", role: "employee" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true); setErr("");
    try {
      await callFunction("create-employee", { ...f, hourly_rate: Number(f.hourly_rate || 0), email: f.email.trim() });
      onSaved();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal title={t("newEmployee")} onClose={onClose}>
      <div className="space-y-4">
        <Field label={t("name")}><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("email")}><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label={t("phone")}><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("hourlyRate")}><input className="input" type="number" min="0" step="0.01" value={f.hourly_rate} onChange={(e) => setF({ ...f, hourly_rate: e.target.value })} /></Field>
          <Field label={t("language")}>
            <select className="input" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}>
              <option value="pt">Português</option><option value="en">English</option>
            </select>
          </Field>
        </div>
        <Field label={t("role")}>
          <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            <option value="employee">{t("roleEmployee")}</option>
            <option value="admin">{t("roleAdmin")}</option>
          </select>
        </Field>
        <Field label={t("password")}>
          <input className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <span className="text-xs text-slate-500">{t("passwordHint")}</span>
        </Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>{t("cancel")}</button>
          <button className="btn-primary" onClick={save} disabled={busy || !f.full_name || !f.email || f.password.length < 6}>{t("save")}</button>
        </div>
      </div>
    </Modal>
  );
}

function EditEmployee({ emp, onClose, onSaved, onDeleted }: { emp: Profile; onClose: () => void; onSaved: () => void; onDeleted: () => void }) {
  const { t } = useI18n();
  const errText = useErrorText();
  const [busy, setBusy] = useState(false);
  const { profile } = useAuth();
  const [f, setF] = useState(emp);
  const [err, setErr] = useState("");
  const isMe = profile?.id === emp.id;

  const save = async () => {
    const { error } = await supabase.from("profiles").update({
      full_name: f.full_name, phone: f.phone, hourly_rate: Number(f.hourly_rate), language: f.language,
      role: isMe ? emp.role : f.role, active: isMe ? true : f.active,
    }).eq("id", emp.id);
    if (error) setErr(error.message); else onSaved();
  };

  const remove = async () => {
    if (!confirm(t("confirmDeleteEmployee", { name: emp.full_name || emp.email || "" }))) return;
    setBusy(true); setErr("");
    try { await callFunction("delete-employee", { id: emp.id }); onDeleted(); }
    catch (e) { setErr(errText(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={emp.full_name || emp.email || ""} onClose={onClose}>
      <div className="space-y-4">
        <Field label={t("name")}><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("phone")}><input className="input" value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label={t("hourlyRate")}><input className="input" type="number" min="0" step="0.01" value={f.hourly_rate} onChange={(e) => setF({ ...f, hourly_rate: Number(e.target.value) })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("language")}>
            <select className="input" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value as Profile["language"] })}>
              <option value="pt">Português</option><option value="en">English</option>
            </select>
          </Field>
          <Field label={t("role")}>
            <select className="input" value={f.role} disabled={isMe} onChange={(e) => setF({ ...f, role: e.target.value as Profile["role"] })}>
              <option value="employee">{t("roleEmployee")}</option><option value="admin">{t("roleAdmin")}</option>
              {f.role === "developer" && <option value="developer">{t("roleDeveloper")}</option>}
            </select>
          </Field>
        </div>
        {!isMe && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />{t("active")}
          </label>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-between gap-2">
          {!isMe ? <button className="btn-ghost text-red-600" onClick={remove} disabled={busy}>{t("delete")}</button> : <span />}
          <div className="flex gap-2">
          <button className="btn-secondary" onClick={onClose}>{t("cancel")}</button>
          <button className="btn-primary" onClick={save}>{t("save")}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function Team() {
  const { t, lang } = useI18n();
  const { company } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Profile[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);

  const load = () => supabase.from("profiles").select("*").order("active", { ascending: false }).order("full_name")
    .then(({ data }) => setRows((data ?? []) as Profile[]));
  useEffect(() => { load(); }, []);

  return (
    <div>
      {toast.node}
      <PageHeader title={t("navTeam")}>
        <button className="btn-primary" onClick={() => setCreating(true)}>+ {t("newEmployee")}</button>
      </PageHeader>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty /> : (
          <table className="table">
            <thead><tr><th>{t("name")}</th><th>{t("email")}</th><th>{t("phone")}</th><th>{t("role")}</th><th className="text-right">{t("hourlyRate")}</th><th>{t("status")}</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.active ? "" : "opacity-50"}>
                  <td className="font-medium">{r.full_name}</td>
                  <td>{r.email}</td>
                  <td>{r.phone}</td>
                  <td>{r.role === "developer" ? t("roleDeveloper") : r.role === "admin" ? t("roleAdmin") : t("roleEmployee")}</td>
                  <td className="text-right">{money(r.hourly_rate, lang, company?.currency)}</td>
                  <td>
                    <span className={`badge ${r.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                      {r.active ? t("active") : t("inactiveLabel")}
                    </span>
                  </td>
                  <td className="text-right"><button className="btn-ghost px-2" onClick={() => setEditing(r)}>{t("edit")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {creating && <NewEmployee onClose={() => setCreating(false)} onSaved={() => { setCreating(false); toast.ok(t("saved")); load(); }} />}
      {editing && <EditEmployee emp={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast.ok(t("saved")); load(); }} onDeleted={() => { setEditing(null); toast.ok(t("deleted")); load(); }} />}
    </div>
  );
}
