import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Lang } from "./types";
import { fmtDistance } from "./format";

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
  navHoursShort: ["Folha", "Payroll"],
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
  exportCsv: ["Exportar CSV", "Export CSV"], disconnect: ["Desconectar", "Disconnect"],
  confirmDisconnect: ["Desconectar {name}? O sistema perde o acesso a esse banco e as contas e lançamentos que vieram dele serão apagados. Lançamentos manuais e de invoices continuam.",
    "Disconnect {name}? The system loses access to this bank and the accounts and transactions imported from it will be deleted. Manual and invoice entries stay."],
  disconnected: ["Banco desconectado. {n} lançamentos apagados.", "Bank disconnected. {n} transactions deleted."], newCategory: ["Nova categoria", "New category"],

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
  invoiceNumberAuto: ["Nº automático", "Auto number"],
  invoiceNumberHelp: ["Pode trocar o número (ex.: para continuar a numeração de outro sistema). Os próximos seguem a partir dele.", "You can change the number (e.g. to continue another system's numbering). Next ones follow from it."],
  invoiceNumberTaken: ["Já existe um invoice com esse número. Escolha outro.", "An invoice with this number already exists. Pick another."],
  duplicate: ["Duplicar", "Duplicate"], fromHours: ["Puxar horas do período", "Import hours from period"],

  // clientes
  newClient: ["Novo cliente", "New client"], contact: ["Contato", "Contact"], city: ["Cidade", "City"],
  state: ["Estado", "State"], zip: ["ZIP", "ZIP"],

  // equipe
  newEmployee: ["Novo funcionário", "New employee"], hourlyRate: ["Valor por hora", "Hourly rate"], role: ["Função", "Role"],
  active: ["Ativo", "Active"], inactiveLabel: ["Inativo", "Inactive"], roleAdmin: ["Administrador", "Admin"],
  roleEmployee: ["Funcionário", "Employee"], roleDeveloper: ["Desenvolvedor", "Developer"], passwordHint: ["Senha inicial (mín. 6). Passe para o funcionário entrar pelo celular.",
    "Initial password (min. 6). Give it to the employee to sign in on their phone."],
  deactivate: ["Desativar", "Deactivate"],
  confirmDeleteEmployee: ["Excluir {name}? O login dele será apagado e não dá para desfazer.", "Delete {name}? Their login will be removed and this cannot be undone."],
  deleted: ["Excluído.", "Deleted."],
  err_HAS_HISTORY: ["Este funcionário já tem horas registradas, então não pode ser excluído (o histórico de pagamento seria perdido). Desmarque \"Ativo\" para desativar o acesso.",
    "This employee already has recorded hours, so they can't be deleted (payroll history would be lost). Uncheck \"Active\" to disable their access instead."],
  confirmForceDelete: ["{name} tem horas registradas. Como desenvolvedor, você pode excluir mesmo assim, e TODAS as batidas de ponto dele serão apagadas. Continuar?",
    "{name} has recorded hours. As developer you can delete anyway, and ALL of their punches will be removed. Continue?"],
  confirmDeleteInvoice: ["Excluir este invoice? Se ele estava pago, o lançamento no Financeiro também será apagado.", "Delete this invoice? If it was paid, its Finance entry will be removed too."],
  err_PLAID_NOT_CONFIGURED: ["A conexão com o banco ainda não foi configurada (faltam as chaves do Plaid no Supabase).", "Bank connection is not set up yet (Plaid keys are missing in Supabase)."],
  err_CANNOT_DELETE_SELF: ["Você não pode excluir o seu próprio usuário.", "You can't delete your own user."], activate: ["Ativar", "Activate"],

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
  hello: ["Olá", "Hi"], currentShift: ["Turno atual", "Current shift"],
  longShiftWarn: ["Seu ponto está aberto há {h} horas. Se esqueceu de bater a saída, bata agora e avise o administrador para corrigir o horário.",
    "Your shift has been open for {h} hours. If you forgot to clock out, do it now and ask your administrator to fix the time."],
  openShifts: ["Pontos em aberto", "Open shifts"], longShift: ["verificar: aberto há {h} h", "check: open {h} h"],
  history: ["Histórico de alterações", "Change history"],
  mfaTitle: ["Confirmação em duas etapas", "Two-step verification"],
  mfaEnrollHelp: ["Para conectar um banco, ative a confirmação em duas etapas. Abra o Google Authenticator (ou outro app autenticador), toque em + e escaneie o código abaixo. Depois digite o código de 6 dígitos que aparecer.",
    "To connect a bank, turn on two-step verification. Open Google Authenticator (or another authenticator app), tap + and scan the code below. Then enter the 6-digit code it shows."],
  mfaManual: ["Ou digite esta chave no app:", "Or type this key in the app:"],
  mfaVerifyHelp: ["Digite o código de 6 dígitos do seu app autenticador.", "Enter the 6-digit code from your authenticator app."],
  mfaCode: ["Código", "Code"], mfaConfirm: ["Confirmar", "Confirm"],
  mfaWrong: ["Código inválido ou vencido. Confira o app e tente de novo.", "Invalid or expired code. Check the app and try again."],
  err_MFA_WRONG_CODE: ["Código incorreto. Use o código que aparece AGORA no app autenticador (ele muda a cada 30 segundos).", "Wrong code. Use the code showing NOW in your authenticator app (it changes every 30 seconds)."],
  err_MFA_LOCKED: ["Muitas tentativas erradas. Espere 10 minutos e tente de novo.", "Too many wrong attempts. Wait 10 minutes and try again."],
  err_MFA_NOT_ENROLLED: ["Feche e clique em Conectar banco de novo para cadastrar o autenticador.", "Close and click Connect bank again to set up the authenticator."],
  mfaUseEntry: ["No app autenticador, use a conta:", "In your authenticator app, use the account:"],
  mfaOldWarn: ["Se você já tinha escaneado um QR code da Evolution Pro antes, APAGUE essa conta antiga do app. Ela não funciona mais e gera códigos errados.",
    "If you scanned an Evolution Pro QR code before, DELETE that old account from the app. It no longer works and gives wrong codes."],
  mfaOpenApp: ["Adicionar ao app autenticador", "Add to authenticator app"],
  mfaOpenAppHelp: ["Está neste celular? Toque no botão acima: o Google Authenticator abre já com a chave certa. Depois volte aqui e digite o código.",
    "On this phone? Tap the button above: Google Authenticator opens with the right key. Then come back and enter the code."],
  mfaManualType: ["Se digitar à mão: escolha \"Chave de configuração\", cole a chave e deixe o tipo \"Baseado no tempo\".", "If typing by hand: choose \"Enter a setup key\", paste the key and keep the type \"Time based\"."],
  pkIntro: ["Para conectar ou desconectar um banco, confirme que é você.", "To connect or disconnect a bank, confirm it's you."],
  pkUse: ["Confirmar com Face ID / digital", "Confirm with Face ID / fingerprint"],
  pkHelp: ["Na primeira vez, o celular pergunta se quer salvar um acesso (passkey) para evolutionprocarpentry.com: toque em Continuar e confirme com o rosto ou a digital. Nas próximas, é só olhar para o celular.",
    "The first time, your phone asks to save a passkey for evolutionprocarpentry.com: tap Continue and confirm with your face or fingerprint. Next times, just look at your phone."],
  pkUseApp: ["Prefiro usar um app autenticador (código de 6 dígitos)", "I'd rather use an authenticator app (6-digit code)"],
  pkCancelled: ["Confirmação cancelada. Toque de novo e confirme com o rosto ou a digital.", "Confirmation cancelled. Tap again and confirm with your face or fingerprint."],
  err_PASSKEY_FAILED: ["Não foi possível confirmar. Tente de novo.", "Couldn't confirm. Please try again."],
  err_PASSKEY_EXPIRED: ["Demorou demais. Toque de novo para confirmar.", "That took too long. Tap again to confirm."],
  err_PASSKEY_NONE: ["Nenhum Face ID cadastrado ainda.", "No Face ID set up yet."],
  mfaRestart: ["Gerar novo QR code", "Generate a new QR code"],
  err_MFA_ALREADY_ENROLLED: ["O autenticador já está cadastrado. Se perdeu o celular, peça ao desenvolvedor para reiniciar.", "The authenticator is already set up. If you lost your phone, ask the developer to reset it."],
  err_MFA_REQUIRED: ["É preciso fazer a confirmação em duas etapas para conectar banco.", "Two-step verification is required to connect a bank."],
  toReceive: ["A receber", "To receive"], received: ["Recebido", "Received"], paidOn: ["Pago em {date}", "Paid on {date}"],
  halfMonth: ["Esta quinzena", "This half-month"], weekly: ["Semanal", "Weekly"], biweekly: ["Quinzenal", "Biweekly"], monthly: ["Mensal", "Monthly"],
  pay: ["Pagar", "Pay"], paid: ["Pago", "Paid"], payTitle: ["Pagar {name}", "Pay {name}"], reviewHours: ["Confira as horas", "Review the hours"],
  fixPunches: ["Corrigir batidas", "Fix punches"], gross: ["Horas × valor/hora", "Hours × rate"], adjustment: ["Ajuste (bônus + / desconto −)", "Adjustment (bonus + / deduction −)"],
  totalToPay: ["Total a pagar", "Total to pay"], method: ["Forma de pagamento", "Payment method"], reference: ["Nº de confirmação (opcional)", "Confirmation # (optional)"],
  m_zelle: ["Zelle", "Zelle"], m_cash: ["Dinheiro", "Cash"], m_check: ["Cheque", "Check"], m_transfer: ["Transferência", "Transfer"], m_other: ["Outro", "Other"],
  zelleSteps: ["Abra o app do banco → Zelle → envie o valor para o contato abaixo. Depois volte aqui e confirme.", "Open your bank app → Zelle → send the amount to the contact below. Then come back and confirm."],
  zelleContact: ["Zelle (e-mail ou telefone)", "Zelle (email or phone)"], zelleName: ["Nome no Zelle", "Name on Zelle"],
  noZelle: ["Este funcionário não tem Zelle cadastrado. Cadastre em Equipe → Editar.", "This employee has no Zelle on file. Add it in Team → Edit."],
  copy: ["Copiar", "Copy"], copied: ["Copiado!", "Copied!"], confirmPayment: ["Confirmar pagamento", "Confirm payment"],
  paymentDone: ["Pagamento registrado e lançado no financeiro.", "Payment recorded and added to Finance."],
  undoPayment: ["Desfazer", "Undo"], confirmUndo: ["Desfazer este pagamento? A saída no financeiro também será apagada.", "Undo this payment? The Finance entry will be deleted too."],
  err_OPEN_SHIFTS: ["Há ponto em aberto neste período. Corrija as batidas antes de pagar.", "There are open shifts in this period. Fix the punches before paying."],
  err_ALREADY_PAID: ["Este período já foi pago para este funcionário.", "This period was already paid for this employee."],
  err_NOTHING_TO_PAY: ["Não há valor a pagar neste período.", "There is nothing to pay for this period."],
  payrollPaid: ["Folha paga", "Payroll paid"], hoursPeriod: ["Horas no período", "Hours in period"], payrollDue: ["Folha a pagar", "Payroll due"], mySchedule: ["Minha escala", "My schedule"], siteToday: ["Seu local de trabalho hoje", "Your job site today"],
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
  err_OUT_OF_RANGE: ["Você está a {dist} do local. Precisa estar a até {radius} m para bater o ponto.",
    "You are {dist} from the site. You must be within {radius} m to punch."],
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
    if (key in dict) return t(key, { dist: code === "OUT_OF_RANGE" ? fmtDistance(Number(a)) : a, radius: b, acc: a });
    return raw;
  };
}
