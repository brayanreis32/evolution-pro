import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useI18n } from "../../lib/i18n";
import type { Client } from "../../lib/types";
import { Empty, Field, Modal, PageHeader, useToast } from "../../components/ui";

export function ClientForm({ client, onClose, onSaved }: { client: Partial<Client>; onClose: () => void; onSaved: (c: Client) => void }) {
  const { t } = useI18n();
  const [f, setF] = useState<Partial<Client>>(client);
  const [err, setErr] = useState("");
  const set = (k: keyof Client) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    const { id, ...row } = f as Client & { created_at?: string };
    delete (row as { created_at?: string }).created_at;
    const q = id ? supabase.from("clients").update(row).eq("id", id) : supabase.from("clients").insert(row);
    const { data, error } = await q.select().single();
    if (error) setErr(error.message); else onSaved(data as Client);
  };

  return (
    <Modal title={f.id ? f.name ?? "" : t("newClient")} onClose={onClose}>
      <div className="space-y-4">
        <Field label={t("name")}><input className="input" value={f.name ?? ""} onChange={set("name")} placeholder="ABC Carpentry LLC" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("contact")}><input className="input" value={f.contact_name ?? ""} onChange={set("contact_name")} /></Field>
          <Field label={t("phone")}><input className="input" value={f.phone ?? ""} onChange={set("phone")} /></Field>
        </div>
        <Field label={t("email")}><input className="input" type="email" value={f.email ?? ""} onChange={set("email")} /></Field>
        <Field label={t("address")}><input className="input" value={f.address ?? ""} onChange={set("address")} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("city")}><input className="input" value={f.city ?? ""} onChange={set("city")} /></Field>
          <Field label={t("state")}><input className="input" value={f.state ?? ""} onChange={set("state")} /></Field>
          <Field label={t("zip")}><input className="input" value={f.zip ?? ""} onChange={set("zip")} /></Field>
        </div>
        <Field label={t("notes")}><textarea className="input" rows={2} value={f.notes ?? ""} onChange={set("notes")} /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>{t("cancel")}</button>
          <button className="btn-primary" onClick={save} disabled={!f.name}>{t("save")}</button>
        </div>
      </div>
    </Modal>
  );
}

export default function Clients() {
  const { t } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<Client[]>([]);
  const [editing, setEditing] = useState<Partial<Client> | null>(null);

  const load = () => supabase.from("clients").select("*").order("name").then(({ data }) => setRows((data ?? []) as Client[]));
  useEffect(() => { load(); }, []);

  const remove = async (c: Client) => {
    if (!confirm(t("confirmDelete"))) return;
    const { error } = await supabase.from("clients").delete().eq("id", c.id);
    if (error) toast.fail(error.message); else load();
  };

  return (
    <div>
      {toast.node}
      <PageHeader title={t("navClients")}>
        <button className="btn-primary" onClick={() => setEditing({})}>+ {t("newClient")}</button>
      </PageHeader>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty /> : (
          <table className="table">
            <thead><tr><th>{t("name")}</th><th>{t("contact")}</th><th>{t("email")}</th><th>{t("phone")}</th><th>{t("city")}</th><th></th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.name}</td><td>{c.contact_name}</td><td>{c.email}</td><td>{c.phone}</td>
                  <td>{[c.city, c.state].filter(Boolean).join(", ")}</td>
                  <td className="whitespace-nowrap text-right">
                    <button className="btn-ghost px-2" onClick={() => setEditing(c)}>{t("edit")}</button>
                    <button className="btn-ghost px-2 text-red-600" onClick={() => remove(c)}>{t("delete")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing && <ClientForm client={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast.ok(t("saved")); load(); }} />}
    </div>
  );
}
