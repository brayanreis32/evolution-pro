import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Building2, CalendarClock, Clock, DollarSign, FileText, LayoutDashboard, LogOut, MapPin, Menu,
  Timer, Users, UserSquare2, X, type LucideIcon,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useI18n, type DictKey } from "../lib/i18n";
import { supabase } from "../lib/supabase";
import { LangSwitch } from "./ui";

type Item = { to: string; label: DictKey; icon: LucideIcon; navShort?: DictKey };

const adminItems: Item[] = [
  { to: "/", label: "navDashboard", icon: LayoutDashboard },
  { to: "/financeiro", label: "navFinance", icon: DollarSign },
  { to: "/invoices", label: "navInvoices", icon: FileText },
  { to: "/clientes", label: "navClients", icon: UserSquare2 },
  { to: "/equipe", label: "navTeam", icon: Users },
  { to: "/locais", label: "navSites", icon: MapPin },
  { to: "/horas", label: "navTimesheets", icon: CalendarClock, navShort: "navHoursShort" },
  { to: "/ponto", label: "navClock", icon: Timer },
  { to: "/empresa", label: "navSettings", icon: Building2 },
];
// no celular: 4 atalhos + "Mais"
const adminMobile = ["/", "/financeiro", "/horas", "/invoices"];

const employeeItems: Item[] = [
  { to: "/", label: "navClock", icon: Timer },
  { to: "/minhas-horas", label: "navMyHours", icon: Clock },
];

export default function Layout() {
  const { isAdmin, profile, company, signOut } = useAuth();
  const { t, lang } = useI18n();
  const location = useLocation();
  const [sheet, setSheet] = useState(false);
  const items = isAdmin ? adminItems : employeeItems;
  const mobile = isAdmin ? items.filter((i) => adminMobile.includes(i.to)) : items;
  const extra = isAdmin ? items.filter((i) => !adminMobile.includes(i.to)) : [];
  const extraActive = extra.some((i) => location.pathname.startsWith(i.to));

  // fecha o menu "Mais" ao trocar de tela
  useEffect(() => { setSheet(false); window.scrollTo(0, 0); }, [location.pathname]);

  // guarda o idioma escolhido no perfil (vale no celular e no computador)
  useEffect(() => {
    if (profile && profile.language !== lang) {
      supabase.rpc("update_my_profile", { p_language: lang, p_phone: null }).then(() => { profile.language = lang; });
    }
  }, [lang, profile]);

  return (
    <div className="min-h-screen lg:flex">
      {/* menu lateral (computador) */}
      <aside className="no-print hidden lg:flex lg:w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-5">
          {company?.logo_url
            ? <img src={company.logo_url} alt={company.name} className="w-full max-h-20 object-contain" />
            : <div className="font-semibold leading-tight text-slate-900">{company?.name ?? "Evolution Pro"}</div>}
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === "/"}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"}`}>
              <i.icon className="h-[18px] w-[18px]" strokeWidth={2} />{t(i.label)}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4 space-y-3">
          <div className="text-sm">
            <div className="font-medium text-slate-900">{profile?.full_name}</div>
            <div className="text-xs text-slate-500">{profile?.email}</div>
          </div>
          <div className="flex items-center justify-between">
            <LangSwitch />
            <button className="btn-ghost px-2 text-xs" onClick={signOut}>{t("logout")}</button>
          </div>
        </div>
      </aside>

      {/* topo (celular / tablet) — só a logo; idioma e Sair ficam no menu */}
      <header className="no-print lg:hidden sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
        {company?.logo_url
          ? <img src={company.logo_url} alt={company.name} className="h-9 w-auto max-w-[60%] object-contain" />
          : <span className="font-semibold">{company?.name ?? "Evolution Pro"}</span>}
        {isAdmin
          ? <span className="truncate pl-3 text-xs text-slate-500">{profile?.full_name}</span>
          : (
            <div className="flex items-center gap-2">
              <LangSwitch />
              <button className="btn-ghost h-10 px-3 text-sm" onClick={signOut} aria-label={t("logout")}><LogOut className="h-5 w-5" /></button>
            </div>
          )}
      </header>

      <main className="flex-1 min-w-0 px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:py-8 lg:pb-8">
        <Outlet />
      </main>

      {/* menu inferior (celular / tablet) */}
      <nav className="no-print lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-xl">
          {mobile.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === "/"}
              className={({ isActive }) => `flex min-h-[60px] min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-medium ${isActive ? "text-brand-700" : "text-slate-500"}`}>
              {({ isActive }) => (
                <>
                  <span className={`flex h-8 w-12 items-center justify-center rounded-full transition ${isActive ? "bg-brand-100" : ""}`}>
                    <i.icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  <span className="w-full truncate text-center leading-none">{t(i.navShort ?? i.label)}</span>
                </>
              )}
            </NavLink>
          ))}
          {isAdmin && (
            <button onClick={() => setSheet(true)}
              className={`flex min-h-[60px] min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-medium ${extraActive ? "text-brand-700" : "text-slate-500"}`}>
              <span className={`flex h-8 w-12 items-center justify-center rounded-full ${extraActive ? "bg-brand-100" : ""}`}><Menu className="h-[22px] w-[22px]" /></span>
              <span className="leading-none">{lang === "pt" ? "Mais" : "More"}</span>
            </button>
          )}
        </div>
      </nav>

      {/* menu "Mais" (abre de baixo para cima) */}
      {sheet && (
        <div className="no-print lg:hidden fixed inset-0 z-50 flex items-end bg-slate-900/40" onClick={() => setSheet(false)}>
          <div className="w-full rounded-t-2xl bg-white pb-[calc(env(safe-area-inset-bottom)+12px)] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <div>
                <div className="font-semibold text-slate-900">{profile?.full_name}</div>
                <div className="text-xs text-slate-500">{profile?.email}</div>
              </div>
              <button className="btn-ghost h-10 w-10 p-0" onClick={() => setSheet(false)} aria-label="close"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2 px-4 py-2">
              {extra.map((i) => (
                <NavLink key={i.to} to={i.to}
                  className={({ isActive }) => `flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium ${isActive ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-700"}`}>
                  <i.icon className="h-6 w-6" />{t(i.label)}
                </NavLink>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-slate-200 px-5 pt-3">
              <LangSwitch />
              <button className="btn-ghost h-11 gap-2 px-3 text-red-600" onClick={signOut}><LogOut className="h-5 w-5" />{t("logout")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tela "Mais" (link direto /mais) — mesma lista do menu. */
export function MoreMenu() {
  const { t } = useI18n();
  const { signOut } = useAuth();
  return (
    <div className="space-y-2">
      {adminItems.filter((i) => !adminMobile.includes(i.to)).map((i) => (
        <NavLink key={i.to} to={i.to} className="card flex items-center gap-3 p-4 font-medium">
          <i.icon className="h-5 w-5 text-slate-500" />{t(i.label)}
        </NavLink>
      ))}
      <div className="flex items-center justify-between pt-2">
        <LangSwitch />
        <button className="btn-ghost text-red-600" onClick={signOut}><LogOut className="h-5 w-5" />{t("logout")}</button>
      </div>
    </div>
  );
}
