import { useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useI18n, type DictKey } from "../lib/i18n";
import { supabase } from "../lib/supabase";
import { LangSwitch } from "./ui";

type Item = { to: string; label: DictKey; icon: string };

const adminItems: Item[] = [
  { to: "/", label: "navDashboard", icon: "◧" },
  { to: "/financeiro", label: "navFinance", icon: "$" },
  { to: "/invoices", label: "navInvoices", icon: "▤" },
  { to: "/clientes", label: "navClients", icon: "◉" },
  { to: "/equipe", label: "navTeam", icon: "☺" },
  { to: "/locais", label: "navSites", icon: "⌖" },
  { to: "/horas", label: "navTimesheets", icon: "◷" },
  { to: "/ponto", label: "navClock", icon: "⏱" },
  { to: "/empresa", label: "navSettings", icon: "⚙" },
];
const adminMobile = ["/", "/financeiro", "/invoices", "/horas", "/locais"];

const employeeItems: Item[] = [
  { to: "/", label: "navClock", icon: "⏱" },
  { to: "/minhas-horas", label: "navMyHours", icon: "◷" },
];

export default function Layout() {
  const { isAdmin, profile, company, signOut } = useAuth();
  const { t, lang } = useI18n();
  const items = isAdmin ? adminItems : employeeItems;
  const mobile = isAdmin ? items.filter((i) => adminMobile.includes(i.to)) : items;

  // guarda o idioma escolhido no perfil (vale no celular e no computador)
  useEffect(() => {
    if (profile && profile.language !== lang) {
      supabase.rpc("update_my_profile", { p_language: lang, p_phone: null }).then(() => { profile.language = lang; });
    }
  }, [lang, profile]);

  return (
    <div className="min-h-screen sm:flex">
      {/* menu lateral (computador) */}
      <aside className="no-print hidden sm:flex sm:w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-3 px-5 py-5">
          {company?.logo_url
            ? <img src={company.logo_url} alt="" className="h-9 w-9 rounded-lg object-contain" />
            : <img src="/icon.svg" alt="" className="h-9 w-9" />}
          <div className="font-semibold leading-tight text-slate-900">{company?.name ?? "Evolution Pro"}</div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === "/"}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"}`}>
              <span className="w-5 text-center">{i.icon}</span>{t(i.label)}
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

      {/* topo (celular) */}
      <header className="no-print sm:hidden sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          {company?.logo_url ? <img src={company.logo_url} alt="" className="h-7 w-7 object-contain" /> : <img src="/icon.svg" alt="" className="h-7 w-7" />}
          <span className="font-semibold">{company?.name ?? "Evolution Pro"}</span>
        </div>
        <div className="flex items-center gap-2">
          <LangSwitch />
          <button className="btn-ghost px-2 text-xs" onClick={signOut}>{t("logout")}</button>
        </div>
      </header>

      <main className="flex-1 min-w-0 px-4 py-5 pb-24 sm:px-8 sm:py-8 sm:pb-8">
        <Outlet />
      </main>

      {/* menu inferior (celular) */}
      <nav className="no-print sm:hidden fixed bottom-0 inset-x-0 z-30 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        {mobile.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === "/"}
            className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? "text-brand-700" : "text-slate-500"}`}>
            <span className="text-lg leading-none">{i.icon}</span>{t(i.label)}
          </NavLink>
        ))}
        {isAdmin && (
          <NavLink to="/mais" className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? "text-brand-700" : "text-slate-500"}`}>
            <span className="text-lg leading-none">⋯</span>{lang === "pt" ? "Mais" : "More"}
          </NavLink>
        )}
      </nav>
    </div>
  );
}

export function MoreMenu() {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      {adminItems.filter((i) => !adminMobile.includes(i.to)).map((i) => (
        <NavLink key={i.to} to={i.to} className="card flex items-center gap-3 p-4 font-medium">
          <span className="w-6 text-center text-lg">{i.icon}</span>{t(i.label)}
        </NavLink>
      ))}
    </div>
  );
}
