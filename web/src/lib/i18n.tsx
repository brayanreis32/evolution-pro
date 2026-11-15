import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Lang } from "./types";

const dict = {
  // comum
  save: ["Salvar", "Save"], cancel: ["Cancelar", "Cancel"], delete: ["Excluir", "Delete"], edit: ["Editar", "Edit"],
  add: ["Adicionar", "Add"], loading: ["Carregando…", "Loading…"], search: ["Buscar", "Search"],
  actions: ["Ações", "Actions"], total: ["Total", "Total"], date: ["Data", "Date"], name: ["Nome", "Name"],
  email: ["E-mail", "Email"], phone: ["Telefone", "Phone"], address: ["Endereço", "Address"], notes: ["Observações", "Notes"],
  status: ["Status", "Status"], from: ["De", "From"], to: ["Até", "To"], thisWeek: ["Esta semana", "This week"],
  lastWeek: ["Semana passada", "Last week"], thisMonth: ["Este mês", "This month"], lastMonth: ["Mês passado", "Last month"],
  confirmDelete: ["Tem certeza que quer excluir?", "Are you sure you want to delete this?"], saved: ["Salvo!", "Saved!"],
  back: ["Voltar", "Back"], print: ["Imprimir / Salvar PDF", "Print / Save PDF"], close: ["Fechar", "Close"],
  optional: ["opcional", "optional"], none: ["Nenhum", "None"], all: ["Todos", "All"], yes: ["Sim", "Yes"], no: ["Não", "No"],
  empty: ["Nada por aqui ainda.", "Nothing here yet."], language: ["Idioma", "Language"],

  // navegação
  navDashboard: ["Início", "Dashboard"], navFinance: ["Financeiro", "Finance"], navInvoices: ["Invoices", "Invoices"],
  navClients: ["Clientes", "Clients"], navTeam: ["Equipe", "Team"], navSites: ["Locais", "Job sites"],
  navTimesheets: ["Horas / Folha", "Hours / Payroll"], navSettings: ["Empresa", "Company"], navClock: ["Ponto", "Clock"],
  navMyHours: ["Minhas horas", "My hours"], logout: ["Sair", "Log out"],

  // login
  loginTitle: ["Entrar", "Sign in"], password: ["Senha", "Password"], loginSubmit: ["Entrar", "Sign in"],
  loginError: ["E-mail ou senha inválidos.", "Invalid email or password."],
  notConfigured: ["Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.",
    "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the .env file."],
  inactive: ["Seu acesso está desativado. Fale com o administrador.", "Your access is disabled. Contact your administrator."],

  // dashboard
  income: ["Entradas", "Income"], expense: ["Saídas", "Expenses"], net: ["Resultado", "Net"],
  openInvoices: ["Invoices em aberto", "Open invoices"], overdue: ["Vencido", "Overdue"],
  hoursThisWeek: ["Horas na semana", "Hours this week"], payrollThisWeek: ["A pagar na semana", "Payroll this week"],
  recentTxns: ["Últimos lançamentos", "Recent transactions"], whoIsWorking: ["Quem está trabalhando agora", "Working right now"],
  nobodyWorking: ["Ninguém com ponto aberto.", "Nobody is clocked in."], byCategory: ["Por categoria", "By category"],
  bankBalance: ["Saldo nos bancos", "Bank balance"], month: ["no mês", "this month"],

  // financeiro
  transactions: ["Lançamentos", "Transactions"], accounts: ["Contas bancárias", "Bank accounts"],
  connectBank: ["Conectar banco", "Connect bank"], sync: ["Sincronizar", "Sync"],
  syncDone: ["Sincronizado: {added} novos, {modified} alterados.", "Synced: {added} new, {modified} updated."],
  addTxn: ["Novo lançamento", "New transaction"], kindIncome: ["Entrada", "Income"], kindExpense: ["Saída", "Expense"],
  category: ["Categoria", "Category"], account: ["Conta", "Account"], description: ["Descrição", "Description"],
  amount: ["Valor", "Amount"], kind: ["Tipo", "Type"], source: ["Origem", "Source"], srcManual: ["Manual", "Manual"],
  srcPlaid: ["Banco", "Bank"], srcInvoice: ["Invoice", "Invoice"], noAccounts: ["Nenhum banco conectado.", "No bank connected."],
  balance: ["Saldo", "Balance"], available: ["Disponível", "Available"], pending: ["pendente", "pending"],
  uncategorized: ["Sem categoria", "Uncategorized"], cashAccount: ["Dinheiro / outra", "Cash / other"],
  lastSync: ["Atualizado", "Updated"], plaidHint: ["A conexão com o banco é feita pelo Plaid, com segurança. O sistema nunca vê sua senha do banco.",
    "Bank connection is handled securely by Plaid. This system never sees your bank password."],
  exportCsv: ["Exportar CSV", "Export CSV"], newCategory: ["Nova categoria", "New category"],

  // invoices
  invoice: ["Invoice", "Invoice"], number: ["Nº", "No."], client: ["Cliente", "Client"], issueDate: ["Emissão", "Issue date"],
  dueDate: ["Vencimento", "Due date"], newInvoice: ["Novo invoice", "New invoice"], items: ["Itens / serviços", "Items / services"],
  qty: ["Qtd", "Qty"], unit: ["Unid.", "Unit"], unitPrice: ["Preço", "Price"], addItem: ["Adicionar item", "Add item"],
  subtotal: ["Subtotal", "Subtotal"], discount: ["Desconto", "Discount"], tax: ["Imposto", "Tax"], taxRate: ["Imposto (%)", "Tax (%)"],
  poNumber: ["Nº do pedido (PO)", "PO number"], jobAddress: ["Endereço do serviço", "Job address"], jobSite: ["Local", "Job site"],
  markSent: ["Marcar como enviado", "Mark as sent"], markPaid: ["Marcar como pago", "Mark as paid"],
  markDraft: ["Voltar para rascunho", "Back to draft"], markVoid: ["Cancelar invoice", "Void invoice"],
  preview: ["Ver / imprimir", "View / print"], st_draft: ["Rascunho", "Draft"], st_sent: ["Enviado", "Sent"],
  st_paid: ["Pago", "Paid"], st_void: ["Cancelado", "Void"], invoiceLang: ["Idioma do invoice", "Invoice language"],
  needClient: ["Cadastre um cliente primeiro.", "Add a client first."], saveInvoice: ["Salvar invoice", "Save invoice"],
  paidHint: ["Quando marcado como pago, o valor entra automaticamente no Financeiro.",
    "When marked as paid, the amount is added to Finance automatically."],
  duplicate: ["Duplicar", "Duplicate"], fromHours: ["Puxar horas do período", "Import hours from period"],

  // clientes
  newClient: ["Novo cliente", "New client"], contact: ["Contato", "Contact"], city: ["Cidade", "City"],
  state: ["Estado", "State"], zip: ["ZIP", "ZIP"],

  // equipe
  newEmployee: ["Novo funcionário", "New employee"], hourlyRate: ["Valor por hora", "Hourly rate"], role: ["Função", "Role"],
  active: ["Ativo", "Active"], inactiveLabel: ["Inativo", "Inactive"], roleAdmin: ["Administrador", "Admin"],
  roleEmployee: ["Funcionário", "Employee"], roleDeveloper: ["Desenvolvedor", "Developer"], passwordHint: ["Senha inicial (mín. 6). Passe para o funcionário entrar pelo celular.",
    "Initial password (min. 6). Give it to the employee to sign in on their phone."],
  deactivate: ["Desativar", "Deactivate"], activate: ["Ativar", "Activate"],

  // locais
  newSite: ["Novo local", "New job site"], radius: ["Raio permitido (metros)", "Allowed radius (meters)"],
  searchAddress: ["Buscar endereço", "Search address"], useMyLocation: ["Usar minha localização atual", "Use my current location"],
  assignments: ["Escala", "Schedule"], assign: ["Escalar", "Assign"], employee: ["Funcionário", "Employee"],
  startDate: ["Início", "Start"], endDate: ["Fim", "End"], noAssignments: ["Ninguém escalado.", "Nobody assigned."],
  viewOnMap: ["Ver no mapa", "View on map"], latitude: ["Latitude", "Latitude"], longitude: ["Longitude", "Longitude"],
  radiusHint: ["O funcionário só consegue bater o ponto dentro deste raio.", "Employees can only clock in/out within this radius."],
  pickResult: ["Escolha o endereço certo:", "Pick the right address:"], noResults: ["Endereço não encontrado.", "Address not found."],
  assignAll: ["Escalar toda a equipe", "Assign whole team"], siteActive: ["Local ativo", "Active site"],
  needCoords: ["Busque o endereço ou use sua localização para marcar o ponto no mapa.", "Search the address or use your location to set the map point."],

  // horas / folha
  payroll: ["Folha de pagamento", "Payroll"], hours: ["Horas", "Hours"], shifts: ["Turnos", "Shifts"],
  rate: ["Valor/h", "Rate"], toPay: ["A pagar", "To pay"], details: ["Detalhes", "Details"], clockIn: ["Entrada", "In"],
  clockOut: ["Saída", "Out"], breakCol: ["Pausa", "Break"], worked: ["Trabalhado", "Worked"], open: ["em aberto", "open"],
  addPunch: ["Adicionar batida", "Add punch"], punchType: ["Tipo", "Type"], time: ["Horário", "Time"],
  distance: ["Distância", "Distance"], editedByAdmin: ["corrigido pelo admin", "edited by admin"], punches: ["Batidas", "Punches"],
  p_clock_in: ["Entrada", "Clock in"], p_break_start: ["Início da pausa", "Break start"], p_break_end: ["Fim da pausa", "Break end"],
  p_clock_out: ["Saída", "Clock out"], openShiftWarn: ["Turnos em aberto não entram no total até terem saída.",
    "Open shifts are not counted until they have a clock-out."], payAsExpense: ["Lançar pagamento no Financeiro", "Record payment in Finance"],
  paymentRecorded: ["Pagamento lançado no Financeiro.", "Payment recorded in Finance."],

  // ponto (celular do funcionário)
  hello: ["Olá", "Hi"], siteToday: ["Seu local de trabalho hoje", "Your job site today"],
  noSiteToday: ["Você não está escalado em nenhum local hoje. Fale com o administrador.",
    "You are not assigned to any job site today. Contact your administrator."],
  st_off: ["Fora do expediente", "Off the clock"], st_working: ["Trabalhando", "Working"], st_break: ["Em pausa", "On break"],
  btnClockIn: ["Bater entrada", "Clock in"], btnBreakStart: ["Iniciar pausa", "Start break"],
  btnBreakEnd: ["Voltar da pausa", "End break"], btnClockOut: ["Bater saída", "Clock out"],
  gettingLocation: ["Pegando sua localização…", "Getting your location…"], youAre: ["Você está a", "You are"],
  fromSite: ["do local", "from the site"], inside: ["Dentro da área", "Inside the area"], outside: ["Fora da área", "Outside the area"],
  refreshLocation: ["Atualizar localização", "Refresh location"], punchOk: ["Ponto registrado às {time}", "Punch recorded at {time}"],
  todayHours: ["Hoje", "Today"], since: ["desde", "since"], weekTotal: ["Total da semana", "Week total"],
  installHint: ["Dica: no celular, use \"Adicionar à tela inicial\" para abrir como app.",
    "Tip: on your phone, use \"Add to Home Screen\" to open it like an app."],

  // erros do ponto (vindos do banco)
  err_OUT_OF_RANGE: ["Você está a {dist} m do local. Precisa estar a até {radius} m para bater o ponto.",
    "You are {dist} m from the site. You must be within {radius} m to punch."],
  err_LOW_ACCURACY: ["GPS impreciso ({acc} m). Vá para um lugar aberto e tente de novo.",
    "GPS is not accurate enough ({acc} m). Move to an open area and try again."],
  err_NO_SITE_TODAY: ["Você não está escalado em nenhum local hoje.", "You are not assigned to a job site today."],
  err_ALREADY_CLOCKED_IN: ["Você já bateu a entrada.", "You are already clocked in."],
  err_NOT_CLOCKED_IN: ["Você ainda não bateu a entrada.", "You haven't clocked in yet."],
  err_ON_BREAK: ["Você está em pausa. Volte da pausa primeiro.", "You are on break. End your break first."],
  err_NOT_ON_BREAK: ["Você não está em pausa.", "You are not on break."],
  err_LOCATION_DENIED: ["Permita o acesso à localização nas configurações do navegador.", "Allow location access in your browser settings."],
  err_LOCATION_UNAVAILABLE: ["Não foi possível pegar sua localização. Tente de novo.", "Couldn't get your location. Try again."],
  err_NO_GEOLOCATION: ["Este aparelho não tem localização.", "This device has no location support."],
  err_INACTIVE_USER: ["Seu acesso está desativado.", "Your access is disabled."],
  err_NO_LOCATION: ["Localização não enviada.", "No location sent."],

  // empresa
  company: ["Dados da empresa", "Company details"], logo: ["Logo", "Logo"], uploadLogo: ["Enviar logo", "Upload logo"],
  brandColor: ["Cor da marca (invoice)", "Brand color (invoice)"], timezone: ["Fuso horário", "Time zone"],
  invoicePrefix: ["Prefixo do invoice", "Invoice prefix"], nextNumber: ["Próximo número", "Next number"],
  paymentTerms: ["Prazo de pagamento (dias)", "Payment terms (days)"], invoiceNotes: ["Mensagem no invoice", "Invoice message"],
  paymentInstructions: ["Instruções de pagamento (Zelle, cheque, conta…)", "Payment instructions (Zelle, check, bank…)"],
  taxId: ["EIN / Tax ID", "EIN / Tax ID"], website: ["Site", "Website"],
  gpsAccuracy: ["Precisão mínima do GPS (m)", "Minimum GPS accuracy (m)"], invoiceSettings: ["Invoices", "Invoices"],
  clockSettings: ["Ponto", "Time clock"], tagline: ["Slogan / serviços", "Tagline / services"],
  ownerName: ["Responsável", "Owner / contact"], accentColor: ["Cor de destaque", "Accent color"],
} as const;

export type DictKey = keyof typeof dict;

// Textos do documento do invoice (independe do idioma da tela)
const doc = {
  INVOICE: ["FATURA", "INVOICE"], billTo: ["Cobrar de", "Bill to"], invoiceNo: ["Fatura nº", "Invoice #"],
  date: ["Data", "Date"], due: ["Vencimento", "Due date"], description: ["Descrição", "Description"], qty: ["Qtd", "Qty"],
  rate: ["Valor", "Rate"], amount: ["Total", "Amount"], subtotal: ["Subtotal", "Subtotal"], discount: ["Desconto", "Discount"],
  tax: ["Imposto", "Tax"], total: ["Total", "Total"], balanceDue: ["Valor a pagar", "Balance due"], notes: ["Observações", "Notes"],
  paymentInstructions: ["Como pagar", "Payment instructions"], jobSite: ["Local do serviço", "Job site"], po: ["Pedido (PO)", "PO #"],
  paid: ["PAGO", "PAID"], void: ["CANCELADO", "VOID"], terms: ["Prazo", "Terms"], netDays: ["{n} dias", "Net {n}"],
} as const;

const idx = (l: Lang) => (l === "pt" ? 0 : 1);

function interpolate(s: string, vars?: Record<string, string | number>) {
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? "")) : s;
}

export function docT(lang: Lang) {
  return (k: keyof typeof doc, vars?: Record<string, string | number>) => interpolate(doc[k][idx(lang)], vars);
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: DictKey, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18n>(null!);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem("lang");
      if (saved === "pt" || saved === "en") return saved;
    } catch { /* sem storage */ }
    return navigator.language.toLowerCase().startsWith("pt") ? "pt" : "en";
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("lang", l); } catch { /* ignora */ }
  };

  useEffect(() => { document.documentElement.lang = lang === "pt" ? "pt-BR" : "en"; }, [lang]);

  const t = (k: DictKey, vars?: Record<string, string | number>) => interpolate(dict[k]?.[idx(lang)] ?? k, vars);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

/** Traduz erros do banco tipo "OUT_OF_RANGE:230:150" */
export function useErrorText() {
  const { t } = useI18n();
  return (e: unknown) => {
    const raw = (e as any)?.message ?? String(e);
    const [code, a, b] = raw.split(":");
    const key = `err_${code}` as DictKey;
    if (key in dict) return t(key, { dist: a, radius: b, acc: a });
    return raw;
  };
}
