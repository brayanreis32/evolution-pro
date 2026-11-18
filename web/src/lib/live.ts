import { useEffect, useRef } from "react";
import { supabase } from "./supabase";
import type { Punch } from "./types";

/**
 * Recarrega a tela quando algo muda no banco (ao vivo, via Supabase Realtime),
 * quando a pessoa volta para a aba/app e, por segurança, a cada 60 segundos.
 * A Realtime respeita a RLS: cada um só recebe o que pode ver.
 */
export function useLive(tables: string[], reload: () => void) {
  const fn = useRef(reload);
  fn.current = reload;
  const key = tables.join(",");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => { clearTimeout(timer); timer = setTimeout(() => fn.current(), 300); };

    const channel = supabase.channel(`live:${key}:${Math.random().toString(36).slice(2)}`);
    for (const table of key.split(",")) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, run);
    }
    channel.subscribe();

    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(run, 60000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [key]);
}

/** Minutos trabalhados a partir de uma lista de batidas em ordem (turno aberto conta até agora). */
export function workedMinutes(punches: Punch[], now = Date.now()) {
  let total = 0;
  let inAt: number | null = null;
  let breakAt: number | null = null;
  let breaks = 0;
  for (const p of punches) {
    const t = new Date(p.punched_at).getTime();
    if (p.punch === "clock_in") { inAt = t; breakAt = null; breaks = 0; }
    else if (p.punch === "break_start" && inAt !== null) breakAt = t;
    else if (p.punch === "break_end" && breakAt !== null) { breaks += t - breakAt; breakAt = null; }
    else if (p.punch === "clock_out" && inAt !== null) {
      if (breakAt !== null) breaks += t - breakAt;
      total += t - inAt - breaks;
      inAt = null; breakAt = null; breaks = 0;
    }
  }
  if (inAt !== null) total += now - inAt - breaks - (breakAt !== null ? now - breakAt : 0);
  return Math.max(0, total / 60000);
}

/** Turno aberto há mais que isto é provavelmente uma saída esquecida. */
export const LONG_SHIFT_HOURS = 14;
