import { createClient } from "@supabase/supabase-js";

// Projeto Supabase da Evolution Pro. A anon key é pública (fica no navegador);
// quem protege os dados é o login + Row Level Security no banco.
const DEFAULT_URL = "https://jhdpcmjjxkyynszujjgw.supabase.co";
const DEFAULT_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoZHBjbWpqeGt5eW5zenVqamd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3MzM5NDcsImV4cCI6MjExMDMwOTk0N30.SpVWZzrWG7P1Sl_VclFCRq_0yUvQLLRdjtHbhl5F-yA";

// Usa a variável de ambiente só se ela for válida (evita chave colada com "•••")
const valid = (v: unknown, re: RegExp) => typeof v === "string" && re.test(v.trim());
const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const url = valid(envUrl, /^https:\/\/[a-z0-9-]+\.supabase\.co$/) ? envUrl!.trim() : DEFAULT_URL;
const key = valid(envKey, /^(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_publishable_[A-Za-z0-9_-]+)$/) ? envKey!.trim() : DEFAULT_KEY;

export const supabaseConfigured = Boolean(url && key);
export const supabase = createClient(url || "http://localhost", key || "missing");

/** Chama uma Edge Function e devolve o JSON (lança erro com a mensagem do servidor). */
export async function callFunction<T = any>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = await (error as any).context?.json?.();
      if (ctx?.error) msg = ctx.error;
    } catch { /* ignora */ }
    throw new Error(msg);
  }
  return data as T;
}
