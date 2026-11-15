import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { useI18n } from "./lib/i18n";
import Layout, { MoreMenu } from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/admin/Dashboard";
import Finance from "./pages/admin/Finance";
import Invoices from "./pages/admin/Invoices";
import InvoiceEditor from "./pages/admin/InvoiceEditor";
import InvoiceView from "./pages/admin/InvoiceView";
import Clients from "./pages/admin/Clients";
import Team from "./pages/admin/Team";
import Sites from "./pages/admin/Sites";
import Timesheets from "./pages/admin/Timesheets";
import Settings from "./pages/admin/Settings";
import Clock from "./pages/employee/Clock";
import MyHours from "./pages/employee/MyHours";

export default function App() {
  const { session, profile, loading, isAdmin, signOut } = useAuth();
  const { t } = useI18n();

  if (loading) return <div className="flex min-h-screen items-center justify-center text-slate-500">{t("loading")}</div>;
  if (!session) return <Login />;
  if (!profile || !profile.active) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-slate-600">{t("inactive")}</p>
        <button className="btn-secondary" onClick={signOut}>{t("logout")}</button>
      </div>
    );
  }

  return (
    <Routes>
      {/* invoice para imprimir: tela cheia, sem menu */}
      {isAdmin && <Route path="/invoices/:id/print" element={<InvoiceView />} />}
      <Route element={<Layout />}>
        {isAdmin ? (
          <>
            <Route index element={<Dashboard />} />
            <Route path="financeiro" element={<Finance />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="invoices/:id" element={<InvoiceEditor />} />
            <Route path="clientes" element={<Clients />} />
            <Route path="equipe" element={<Team />} />
            <Route path="locais" element={<Sites />} />
            <Route path="horas" element={<Timesheets />} />
            <Route path="ponto" element={<Clock />} />
            <Route path="empresa" element={<Settings />} />
            <Route path="mais" element={<MoreMenu />} />
          </>
        ) : (
          <>
            <Route index element={<Clock />} />
            <Route path="minhas-horas" element={<MyHours />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
