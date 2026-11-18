import type { Lang } from "./types";

const locale = (lang: Lang) => (lang === "pt" ? "pt-BR" : "en-US");

export const money = (v: number | null | undefined, lang: Lang = "en", currency = "USD") =>
  new Intl.NumberFormat(locale(lang), { style: "currency", currency }).format(Number(v ?? 0));

/** "2026-11-15" -> data local sem problema de fuso */
export const parseDate = (d: string) => {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, day);
};

export const fmtDate = (d: string | null | undefined, lang: Lang = "en") =>
  d ? parseDate(d).toLocaleDateString(locale(lang), { month: "short", day: "numeric", year: "numeric" }) : "—";

/** Data curta para tabelas no celular: "seg., 16/11" */
export const fmtShortDate = (d: string | null | undefined, lang: Lang = "en") =>
  d ? parseDate(d).toLocaleDateString(locale(lang), { weekday: "short", day: "2-digit", month: "2-digit" }) : "—";

export const fmtTime = (ts: string | null | undefined, lang: Lang = "en") =>
  ts ? new Date(ts).toLocaleTimeString(locale(lang), { hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtDateTime = (ts: string, lang: Lang = "en") =>
  new Date(ts).toLocaleString(locale(lang), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export const hours = (minutes: number) => {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};

export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const today = () => iso(new Date());

export const addDays = (d: string, n: number) => {
  const x = parseDate(d);
  x.setDate(x.getDate() + n);
  return iso(x);
};

/** Semana de segunda a domingo que contém a data */
export const weekRange = (d = today()) => {
  const x = parseDate(d);
  const dow = (x.getDay() + 6) % 7;
  const start = addDays(d, -dow);
  return { start, end: addDays(start, 6) };
};

/** Quinzena: 1–15 ou 16–fim do mês */
export const halfMonthRange = (d = today()) => {
  const x = parseDate(d);
  const y = x.getFullYear(), m = x.getMonth();
  return x.getDate() <= 15
    ? { start: iso(new Date(y, m, 1)), end: iso(new Date(y, m, 15)) }
    : { start: iso(new Date(y, m, 16)), end: iso(new Date(y, m + 1, 0)) };
};

export const monthRange = (d = today()) => {
  const x = parseDate(d);
  return {
    start: iso(new Date(x.getFullYear(), x.getMonth(), 1)),
    end: iso(new Date(x.getFullYear(), x.getMonth() + 1, 0)),
  };
};

/** Distância amigável: metros perto, milhas longe (EUA) */
export const fmtDistance = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1609.34).toFixed(1)} mi`);

export const mapsLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;
