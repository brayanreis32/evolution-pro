import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

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
