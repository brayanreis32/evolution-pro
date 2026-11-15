import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import type { Company } from "../../lib/types";
import { Field, PageHeader, useToast } from "../../components/ui";

const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"];

export default function Settings() {
  const { t } = useI18n();
  const { company, reloadCompany } = useAuth();
  const toast = useToast();
  const [f, setF] = useState<Company | null>(company);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { setF(company); }, [company]);
  if (!f) return null;

  const set = (k: keyof Company) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });

  const save = async () => {
    const { id: _id, ...row } = f;
    const { error } = await supabase.from("company_settings").update({ ...row, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) toast.fail(error.message);
    else { toast.ok(t("saved")); reloadCompany(); }
  };

  const upload = async (file: File) => {
    setUploading(true);
    const path = `logo-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("branding").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { toast.fail(error.message); setUploading(false); return; }
    const url = supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
    await supabase.from("company_settings").update({ logo_url: url }).eq("id", 1);
    setF({ ...f, logo_url: url });
    reloadCompany();
    setUploading(false);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {toast.node}
      <PageHeader title={t("company")}>
        <button className="btn-primary" onClick={save}>{t("save")}</button>
      </PageHeader>

      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-24 w-40 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50">
            {f.logo_url ? <img src={f.logo_url} alt="logo" className="max-h-20 max-w-36 object-contain" /> : <span className="text-xs text-slate-400">{t("logo")}</span>}
          </div>
          <label className="btn-secondary cursor-pointer">
            {uploading ? t("loading") : t("uploadLogo")}
            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("name")}><input className="input" value={f.name} onChange={set("name")} /></Field>
          <Field label={t("taxId")}><input className="input" value={f.tax_id ?? ""} onChange={set("tax_id")} /></Field>
          <Field label={t("address")} className="sm:col-span-2"><input className="input" value={f.address ?? ""} onChange={set("address")} /></Field>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <Field label={t("city")}><input className="input" value={f.city ?? ""} onChange={set("city")} /></Field>
            <Field label={t("state")}><input className="input" value={f.state ?? ""} onChange={set("state")} /></Field>
            <Field label={t("zip")}><input className="input" value={f.zip ?? ""} onChange={set("zip")} /></Field>
          </div>
          <Field label={t("phone")}><input className="input" value={f.phone ?? ""} onChange={set("phone")} /></Field>
          <Field label={t("email")}><input className="input" value={f.email ?? ""} onChange={set("email")} /></Field>
          <Field label={t("website")}><input className="input" value={f.website ?? ""} onChange={set("website")} /></Field>
          <Field label={t("brandColor")}>
            <div className="flex gap-2">
              <input type="color" className="h-10 w-12 rounded border border-slate-300" value={f.brand_color} onChange={set("brand_color")} />
              <input className="input" value={f.brand_color} onChange={set("brand_color")} />
            </div>
          </Field>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h2>{t("invoiceSettings")}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("invoicePrefix")}><input className="input" value={f.invoice_prefix} onChange={set("invoice_prefix")} /></Field>
          <Field label={t("nextNumber")}><input className="input" type="number" value={f.next_invoice_number} onChange={set("next_invoice_number")} /></Field>
          <Field label={t("paymentTerms")}><input className="input" type="number" value={f.payment_terms_days} onChange={set("payment_terms_days")} /></Field>
        </div>
        <Field label={t("paymentInstructions")}><textarea className="input" rows={3} value={f.payment_instructions ?? ""} onChange={set("payment_instructions")} placeholder={"Zelle: payments@yourcompany.com\nChecks payable to: …"} /></Field>
        <Field label={t("invoiceNotes")}><textarea className="input" rows={2} value={f.invoice_notes ?? ""} onChange={set("invoice_notes")} /></Field>
      </div>

      <div className="card p-5 space-y-4">
        <h2>{t("clockSettings")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("timezone")}>
            <select className="input" value={f.timezone} onChange={set("timezone")}>
              {TIMEZONES.map((z) => <option key={z}>{z}</option>)}
            </select>
          </Field>
          <Field label={t("gpsAccuracy")}><input className="input" type="number" min={10} max={1000} value={f.max_gps_accuracy_m} onChange={set("max_gps_accuracy_m")} /></Field>
        </div>
      </div>
    </div>
  );
}
