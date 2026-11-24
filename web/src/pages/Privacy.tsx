// Política de privacidade pública (exigida pelo Plaid / bancos). Abre sem login.
export default function Privacy() {
  const updated = "November 24, 2026";
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed text-slate-700">
        <h1 className="mb-1 text-3xl font-bold text-slate-900">Privacy Policy</h1>
        <p className="mb-8 text-sm text-slate-500">Kings Tech · Last updated: {updated} · <a className="underline" href="#pt">Português abaixo</a></p>

        <section className="space-y-4">
          <p>Kings Tech ("we") provides business management software to small companies (bookkeeping, invoices, payroll hours and time clock). This policy explains what data we handle and how.</p>
          <h2 className="pt-2 text-xl font-semibold text-slate-900">Data we collect</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li><b>Account data:</b> name, email, phone and role of users created by the business.</li>
            <li><b>Business records:</b> clients, invoices, income and expense entries, employee hourly rates and payments entered by the business.</li>
            <li><b>Time clock data:</b> clock-in/out times and the device location at the moment of each punch, used only to confirm the employee is at the assigned job site.</li>
            <li><b>Bank data (optional):</b> when the business chooses to connect a bank account through Plaid, we receive account names, last digits, balances and transactions. We never receive or store bank usernames or passwords.</li>
          </ul>
          <h2 className="pt-2 text-xl font-semibold text-slate-900">How we use it</h2>
          <p>Only to provide the service to the business that owns the data: bookkeeping, financial reports, invoices and payroll. We do <b>not</b> sell, rent or share data with third parties for marketing, and we do not make credit decisions.</p>
          <h2 className="pt-2 text-xl font-semibold text-slate-900">Plaid</h2>
          <p>Bank connections are provided by Plaid Inc. By connecting an account, you also agree to the <a className="underline" href="https://plaid.com/legal/#end-user-privacy-policy" target="_blank" rel="noreferrer">Plaid End User Privacy Policy</a>. You can disconnect a bank at any time in the Finance screen; imported bank data is then deleted from our system.</p>
          <h2 className="pt-2 text-xl font-semibold text-slate-900">Security</h2>
          <p>Data is encrypted in transit (HTTPS/TLS) and at rest. Access is restricted per user and role, and connecting a bank requires two-step verification (Face ID / passkey or authenticator app). Bank access tokens are stored server-side and never sent to the browser.</p>
          <h2 className="pt-2 text-xl font-semibold text-slate-900">Retention and deletion</h2>
          <p>Data is kept while the business uses the service. The business may request export or deletion of its data at any time.</p>
          <h2 className="pt-2 text-xl font-semibold text-slate-900">Contact</h2>
          <p>Kings Tech — Brayan Reis — <a className="underline" href="mailto:brayanreis127@gmail.com">brayanreis127@gmail.com</a></p>
        </section>

        <hr className="my-10 border-slate-200" />

        <section id="pt" className="space-y-4">
          <h1 className="text-2xl font-bold text-slate-900">Política de Privacidade</h1>
          <p>A Kings Tech fornece software de gestão para pequenas empresas (financeiro, invoices, horas e ponto). Coletamos: dados de conta dos usuários; registros da empresa (clientes, invoices, lançamentos, valores por hora e pagamentos); horários e localização no momento de cada batida de ponto, só para confirmar que o funcionário está no local escalado; e, se a empresa conectar um banco pelo Plaid, nomes de contas, saldos e lançamentos — nunca usuário ou senha do banco.</p>
          <p>Usamos os dados apenas para prestar o serviço à empresa dona deles. <b>Não vendemos nem compartilhamos</b> dados com terceiros. O banco pode ser desconectado a qualquer momento, e os dados importados dele são apagados. Os dados são criptografados, o acesso é restrito por usuário e conectar banco exige confirmação em duas etapas.</p>
          <p>Contato: Brayan Reis — <a className="underline" href="mailto:brayanreis127@gmail.com">brayanreis127@gmail.com</a></p>
        </section>
      </div>
    </div>
  );
}
