export type Role = "developer" | "admin" | "employee";
export type PunchType = "clock_in" | "break_start" | "break_end" | "clock_out";
export type TxnKind = "income" | "expense";
export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export type Lang = "pt" | "en";

export interface Profile {
  id: string; full_name: string; email: string | null; phone: string | null;
  role: Role; hourly_rate: number; language: Lang; active: boolean; created_at: string;
  zelle_contact: string | null; zelle_name: string | null;
}
export interface PayrollPayment {
  id: string; employee_id: string; period_start: string; period_end: string; hours: number; hourly_rate: number;
  gross: number; adjustment: number; amount: number; method: string; reference: string | null; note: string | null;
  paid_at: string; transaction_id: string | null;
}
export interface Company {
  id: number; name: string; address: string | null; city: string | null; state: string | null; zip: string | null;
  phone: string | null; email: string | null; website: string | null; tax_id: string | null; logo_url: string | null;
  brand_color: string; accent_color: string; tagline: string | null; owner_name: string | null; timezone: string; currency: string; invoice_prefix: string; next_invoice_number: number;
  payment_terms_days: number; invoice_notes: string | null; payment_instructions: string | null; max_gps_accuracy_m: number;
}
export interface JobSite {
  id: string; name: string; address: string; latitude: number; longitude: number;
  radius_m: number; active: boolean; notes: string | null;
}
export interface Assignment { id: string; site_id: string; employee_id: string; start_date: string; end_date: string; }
export interface Punch {
  id: string; employee_id: string; site_id: string | null; punch: PunchType; punched_at: string;
  latitude: number | null; longitude: number | null; accuracy_m: number | null; distance_m: number | null;
  edited_by: string | null; note: string | null;
}
export interface Session {
  employee_id: string; work_date: string; site_id: string | null; clock_in: string; clock_out: string | null;
  break_minutes: number; worked_minutes: number; is_open: boolean;
}
export interface PayrollRow {
  employee_id: string; full_name: string; hourly_rate: number; shifts: number; open_shifts: number; hours: number; amount: number;
}
export interface Category { id: string; name: string; kind: TxnKind; color: string; }
export interface BankAccount {
  id: string; name: string; institution: string | null; mask: string | null; account_type: string | null;
  plaid_item_id: string | null; current_balance: number | null; available_balance: number | null; currency: string; updated_at: string;
}
export interface Transaction {
  id: string; account_id: string | null; txn_date: string; description: string; amount: number; kind: TxnKind;
  category_id: string | null; source: "manual" | "plaid" | "invoice"; invoice_id: string | null; pending: boolean; notes: string | null;
}
export interface Client {
  id: string; name: string; contact_name: string | null; email: string | null; phone: string | null;
  address: string | null; city: string | null; state: string | null; zip: string | null; notes: string | null;
}
export interface Invoice {
  id: string; number: string; client_id: string; site_id: string | null; job_address: string | null; po_number: string | null;
  issue_date: string; due_date: string; status: InvoiceStatus; language: Lang; tax_rate: number; discount: number;
  subtotal: number; tax_amount: number; total: number; notes: string | null; paid_at: string | null; created_at: string;
}
export interface InvoiceItem {
  id?: string; invoice_id?: string; position: number; description: string; quantity: number; unit: string | null;
  unit_price: number; amount?: number;
}
