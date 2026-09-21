export type MetricSet = {
  spend: number;
  impressions: number;
  clicks: number;
  ctr?: number | null;
  cpc?: number | null;
  conversions?: number | null;
  conv_value?: number | null;
  cpa?: number | null;
  roas?: number | null;
  results?: number | null;
  frequency?: number | null;
};

export type Campaign = {
  name: string;
  status: "ativa" | "pausada";
  status_note?: string;
  objective: string;
  result_label?: string;
  curr: MetricSet;
  prev: MetricSet;
  delta_pct: Record<string, number | null>;
};

export type TopAd = {
  name: string;
  ad_set?: string;
  campaign?: string;
  spend: number;
  conversions: number;
  conv_value: number;
  roas: number;
  share_of_campaign_conversions?: number;
  image_url?: string;
  thumbnail_url?: string;
};

// Um ponto da série diária de compras/ROAS (só campanhas com objetivo de
// vendas), usado no gráfico do modo Ao vivo.
export type DailySalesPoint = {
  date: string; // YYYY-MM-DD
  purchases: number;
  spend: number;
  conv_value: number;
  roas: number | null;
};

export type PlatformBlock = {
  account_id: string;
  account_name: string;
  mcc?: string;
  status?: string;
  note?: string;
  campaigns: Campaign[];
  consolidated?: {
    curr: MetricSet;
    prev: MetricSet;
    delta_pct: Record<string, number | null>;
  };
  top_ad?: TopAd;
  best_roas_adset?: TopAd;
  // Anúncios destaque calculados automaticamente (só quando includeSalesInsights
  // é pedido, ex: no modo Ao vivo) — maior ROAS e mais compras, dentro das
  // campanhas com objetivo de vendas.
  top_ad_roas?: TopAd;
  top_ad_conversions?: TopAd;
  // Série diária de compras + ROAS (idem, só quando includeSalesInsights).
  daily_sales?: DailySalesPoint[];
  excluded_note?: string;
};

export type ReportData = {
  generated_at: string;
  client_name?: string;
  period: { start: string; end: string };
  previous_period: { start: string; end: string };
  meta: PlatformBlock;
  google: PlatformBlock;
};

export type WeeklyReportRow = {
  id: number;
  period_start: string;
  period_end: string;
  prev_period_start: string;
  prev_period_end: string;
  data: ReportData;
  generated_at: string;
  created_at: string;
};
