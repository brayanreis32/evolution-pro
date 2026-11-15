import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useErrorText, useI18n } from "../../lib/i18n";
import { distanceM, getPosition, type Position } from "../../lib/geo";
import { fmtDate, fmtTime, hours, mapsLink, today } from "../../lib/format";
import type { JobSite, Punch, PunchType, Session } from "../../lib/types";
import { useToast } from "../../components/ui";

type State = "off" | "working" | "break";

const stateFrom = (p: Punch | null): State =>
  !p || p.punch === "clock_out" ? "off" : p.punch === "break_start" ? "break" : "working";

export default function Clock() {
  const { profile } = useAuth();
  const { t, lang } = useI18n();
  const errText = useErrorText();
  const toast = useToast();

  const [sites, setSites] = useState<JobSite[]>([]);
  const [last, setLast] = useState<Punch | null>(null);
  const [todayPunches, setTodayPunches] = useState<Punch[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [schedule, setSchedule] = useState<{ start_date: string; end_date: string; site_name: string; address: string; latitude: number; longitude: number }[]>([]);
  const [pos, setPos] = useState<Position | null>(null);
  const [posError, setPosError] = useState("");
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState<PunchType | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    if (!profile) return;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [s, l, tp, ws, sc] = await Promise.all([
      supabase.rpc("my_sites_today"),
      supabase.from("time_punches").select("*").eq("employee_id", profile.id).order("punched_at", { ascending: false }).limit(1),
      supabase.from("time_punches").select("*").eq("employee_id", profile.id).gte("punched_at", startOfDay.toISOString()).order("punched_at"),
      supabase.rpc("work_sessions", { p_start: today(), p_end: today(), p_employee: profile.id }),
      supabase.rpc("my_schedule", { p_days: 14 }),
    ]);
    setSchedule((sc.data ?? []) as typeof schedule);
    setSites((s.data ?? []) as JobSite[]);
    setLast(((l.data ?? [])[0] ?? null) as Punch | null);
    setTodayPunches((tp.data ?? []) as Punch[]);
    setSessions((ws.data ?? []) as Session[]);
    setLoaded(true);
  }, [profile]);

  const locate = useCallback(async () => {
    setLocating(true);
    setPosError("");
    try {
      const p = await getPosition();
      setPos(p);
      return p;
    } catch (e) {
      setPosError(errText(e));
      return null;
    } finally {
      setLocating(false);
    }
  }, [errText]);

  useEffect(() => { load(); locate(); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(id); }, []);

  const state = stateFrom(last);

  // local relevante: o da entrada (se trabalhando) ou o mais próximo escalado hoje
  const site = useMemo(() => {
    if (state !== "off" && last?.site_id) return sites.find((s) => s.id === last.site_id) ?? null;
    if (!pos) return sites[0] ?? null;
    return [...sites].sort((a, b) =>
      distanceM(pos.lat, pos.lng, a.latitude, a.longitude) - distanceM(pos.lat, pos.lng, b.latitude, b.longitude))[0] ?? null;
  }, [sites, pos, state, last]);

  const dist = site && pos ? distanceM(pos.lat, pos.lng, site.latitude, site.longitude) : null;
  const inside = dist !== null && site ? dist <= site.radius_m : false;

  const doPunch = async (type: PunchType) => {
    setBusy(type);
    try {
      const p = await locate();
      if (!p) return;
      const { data, error } = await supabase.rpc("punch", { p_type: type, p_lat: p.lat, p_lng: p.lng, p_accuracy: p.accuracy });
      if (error) throw new Error(error.message);
      if ("vibrate" in navigator) navigator.vibrate(80);
      toast.ok(t("punchOk", { time: fmtTime((data as Punch).punched_at, lang) }));
      await load();
    } catch (e) {
      toast.fail(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const workedToday = sessions.reduce((sum, s) => sum + Number(s.worked_minutes), 0);

  const statusStyle = {
    off: "bg-slate-100 text-slate-700",
    working: "bg-emerald-100 text-emerald-800",
    break: "bg-amber-100 text-amber-800",
  }[state];

  const buttons: { type: PunchType; label: string; cls: string; show: boolean }[] = [
    { type: "clock_in", label: t("btnClockIn"), cls: "bg-emerald-600 hover:bg-emerald-700", show: state === "off" },
    { type: "break_start", label: t("btnBreakStart"), cls: "bg-amber-500 hover:bg-amber-600", show: state === "working" },
    { type: "break_end", label: t("btnBreakEnd"), cls: "bg-sky-600 hover:bg-sky-700", show: state === "break" },
    { type: "clock_out", label: t("btnClockOut"), cls: "bg-red-600 hover:bg-red-700", show: state === "working" },
  ];

  return (
    <div className="mx-auto max-w-md space-y-4">
      {toast.node}
      <div>
        <div className="text-sm text-slate-500">{t("hello")},</div>
        <h1>{profile?.full_name}</h1>
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className={`badge px-3 py-1 text-sm ${statusStyle}`}>
            {state === "off" ? t("st_off") : state === "working" ? t("st_working") : t("st_break")}
          </span>
          {state !== "off" && last && <span className="text-xs text-slate-500">{t("since")} {fmtTime(last.punched_at, lang)}</span>}
        </div>

        {loaded && sites.length === 0 && state === "off" ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t("noSiteToday")}</p>
        ) : site && (
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("siteToday")}</div>
            <div className="mt-1 font-semibold text-slate-900">{site.name}</div>
            <a className="text-sm text-brand-600 underline" href={mapsLink(site.latitude, site.longitude)} target="_blank" rel="noreferrer">
              {site.address}
            </a>
          </div>
        )}

        {/* localização */}
        <div className="rounded-lg border border-slate-200 p-3 text-sm">
          {locating ? (
            <span className="text-slate-500">{t("gettingLocation")}</span>
          ) : posError ? (
            <span className="text-red-600">{posError}</span>
          ) : dist !== null && site ? (
            <div className="flex items-center justify-between gap-2">
              <span>
                {t("youAre")} <b>{dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1609).toFixed(1)} mi`}</b> {t("fromSite")}
                <span className="block text-xs text-slate-400">GPS ±{Math.round(pos!.accuracy)} m</span>
              </span>
              <span className={`badge ${inside ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>
                {inside ? t("inside") : t("outside")}
              </span>
            </div>
          ) : null}
          <button className="mt-2 text-xs font-medium text-brand-600" onClick={locate} disabled={locating}>↻ {t("refreshLocation")}</button>
        </div>

        <div className="grid gap-3">
          {buttons.filter((b) => b.show).map((b) => (
            <button
              key={b.type}
              onClick={() => doPunch(b.type)}
              disabled={busy !== null || (b.type === "clock_in" && sites.length === 0)}
              className={`w-full rounded-xl py-5 text-lg font-semibold text-white shadow-sm transition disabled:opacity-50 ${b.cls}`}
            >
              {busy === b.type ? t("gettingLocation") : b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between">
          <h2>{t("todayHours")}</h2>
          <span className="text-xl font-semibold">{hours(workedToday)}</span>
        </div>
        {todayPunches.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {todayPunches.map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <span>{t(`p_${p.punch}` as const)}</span>
                <span className="font-medium">{fmtTime(p.punched_at, lang)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {schedule.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-2">{t("mySchedule")}</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {schedule.map((a) => (
              <li key={a.start_date + a.site_name} className="py-2">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{a.site_name}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {a.start_date === a.end_date ? fmtDate(a.start_date, lang) : `${fmtDate(a.start_date, lang)} → ${fmtDate(a.end_date, lang)}`}
                  </span>
                </div>
                <a className="text-xs text-brand-600 underline" href={mapsLink(a.latitude, a.longitude)} target="_blank" rel="noreferrer">{a.address}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-center text-xs text-slate-400">{t("installHint")}</p>
    </div>
  );
}
