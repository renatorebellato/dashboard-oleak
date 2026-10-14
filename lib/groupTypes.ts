// Tipos do dashboard de grupo (clientes com várias contas do Google Ads, ex:
// Grupo Meddi). O servidor devolve tudo de uma vez, em quantidades SOMÁVEIS,
// e o navegador filtra por conta/campanha e recalcula os indicadores na hora
// (sem nova chamada à API a cada troca de filtro).

// Quantidades aditivas de um recorte (campanha, conta, seleção...).
// As parcelas de impressão do Google são porcentagens por campanha; para
// somar entre campanhas guardamos o "volume" correspondente:
//   eligible     = impressões de Pesquisa / parcela de impressões
//   budget_lost  = parcela perdida por orçamento × eligible
//   top          = parcela na parte superior × eligible
//   abs_top      = parcela na 1ª posição (topo absoluto) × eligible
// e a parcela agregada é sum(x) / sum(eligible) — uma média ponderada pelas
// impressões que cada campanha poderia ter recebido.
export type RawMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  eligible: number;
  budget_lost: number;
  top: number;
  abs_top: number;
};

// [data YYYY-MM-DD, conversões, custo]
export type DailyRow = [string, number, number];

export type GroupCampaign = {
  id: string;
  name: string;
  status: "ativa" | "pausada";
  channel: string;
  curr: RawMetrics;
  prev: RawMetrics;
  daily: DailyRow[];
};

export type GroupAccount = {
  id: string; // 000-000-0000
  name: string; // nome curto da unidade (sem o prefixo do filtro)
  status?: "erro_sincronizacao";
  note?: string;
  campaigns: GroupCampaign[];
};

export type TermRow = {
  account_id: string;
  campaign_id: string;
  text: string;
  match?: string; // só palavras-chave: EXACT | PHRASE | BROAD
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
};

export type GroupDashboardData = {
  generated_at: string;
  client_name: string;
  period: { start: string; end: string };
  previous_period: { start: string; end: string };
  accounts: GroupAccount[];
  keywords: TermRow[];
  search_terms: TermRow[];
  note?: string;
};
