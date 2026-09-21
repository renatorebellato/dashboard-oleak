import type { Campaign, MetricSet, PlatformBlock } from "./types";
import { deltaPct, round } from "./metrics";

// Versão da Google Ads API. A Google desativa versões antigas com um aviso
// de ~1 ano de antecedência — atualize periodicamente.
// https://developers.google.com/google-ads/api/docs/release-notes
const API_VERSION = "v23";

async function getAccessToken(): Promise<string> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET ou GOOGLE_ADS_REFRESH_TOKEN não configurados."
      );
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Falha ao renovar token OAuth do Google: ${JSON.stringify(json)}`);
  }
  return json.access_token as string;
}

type GaqlRow = {
  campaign: { id: string; name: string; status: string; advertisingChannelType?: string };
  metrics: {
  costMicros?: string;
  impressions?: string;
  clicks?: string;
  ctr?: number;
  averageCpc?: string;
  conversions?: number;
  conversionsValue?: number;
  };
};

async function runGaql(customerId: string, query: string): Promise<GaqlRow[]> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID; // ID do MCC, só dígitos
if (!developerToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN não configurado.");

const accessToken = await getAccessToken();
  const cleanCustomerId = customerId.replace(/-/g, "");

const res = await fetch(
  `https://googleads.googleapis.com/${API_VERSION}/customers/${cleanCustomerId}/googleAds:searchStream`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      ...(loginCustomerId ? { "login-customer-id": loginCustomerId.replace(/-/g, "") } : {}),
    },
    body: JSON.stringify({ query }),
  }
  );

const json = await res.json();
  if (!res.ok) {
    throw new Error(`Google Ads API error: ${JSON.stringify(json)}`);
  }
  // searchStream retorna um array de "batches", cada um com .results
const rows: GaqlRow[] = [];
  const batches = Array.isArray(json) ? json : [json];
  for (const batch of batches) {
    for (const r of batch.results ?? []) rows.push(r);
  }
  return rows;
}

function microsToNumber(micros?: string | number): number {
  if (micros == null) return 0;
  return Number(micros) / 1_000_000;
}

function toMetricSet(row: GaqlRow | undefined): MetricSet {
  const spend = row ? microsToNumber(row.metrics.costMicros) : 0;
  const impressions = row ? Number(row.metrics.impressions ?? 0) : 0;
  const clicks = row ? Number(row.metrics.clicks ?? 0) : 0;
  const conversions = row ? Number(row.metrics.conversions ?? 0) : 0;
  const conv_value = row ? Number(row.metrics.conversionsValue ?? 0) : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : null;
  const cpa = conversions > 0 ? spend / conversions : null;
  const roas = spend > 0 && conv_value > 0 ? conv_value / spend : null;
  return {
    spend: round(spend, 2),
    impressions,
    clicks,
    ctr: round(ctr, 2),
    cpc: cpc != null ? round(cpc, 4) : null,
    conversions: conversions || null,
    conv_value: conv_value || null,
    cpa: cpa != null ? round(cpa, 4) : null,
    roas: roas != null ? round(roas, 6) : null,
  };
}

function sumMetricSet(rows: Campaign[], side: "curr" | "prev"): MetricSet {
  const spend = round(rows.reduce((a, c) => a + (c[side].spend || 0), 0), 2);
  const impressions = rows.reduce((a, c) => a + (c[side].impressions || 0), 0);
  const clicks = rows.reduce((a, c) => a + (c[side].clicks || 0), 0);
  const conversions = rows.reduce((a, c) => a + (c[side].conversions || 0), 0) || null;
  const conv_value = round(rows.reduce((a, c) => a + (c[side].conv_value || 0), 0), 2) || null;
  const ctr = impressions > 0 ? round((clicks / impressions) * 100, 2) : 0;
  const cpa = conversions ? round(spend / conversions, 4) : null;
  const roas = conv_value && spend > 0 ? round(conv_value / spend, 6) : null;
  return { spend, impressions, clicks, ctr, conversions, conv_value, cpa, roas };
}

const QUERY_FIELDS = `
campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr,
metrics.average_cpc, metrics.conversions, metrics.conversions_value
`;

export async function fetchGooglePlatformBlock(opts: {
  customerId: string;
  accountName: string;
  mccName?: string;
  period: { start: string; end: string };
  previousPeriod: { start: string; end: string };
}): Promise<PlatformBlock> {
  const { customerId, accountName, mccName, period, previousPeriod } = opts;

try {
  const [currRows, prevRows] = await Promise.all([
    runGaql(
      customerId,
      `SELECT ${QUERY_FIELDS} FROM campaign WHERE segments.date BETWEEN '${period.start}' AND '${period.end}'`
      ),
    runGaql(
      customerId,
      `SELECT ${QUERY_FIELDS} FROM campaign WHERE segments.date BETWEEN '${previousPeriod.start}' AND '${previousPeriod.end}'`
      ),
    ]);

  const currById = new Map(currRows.map((r) => [r.campaign.id, r]));
  const prevById = new Map(prevRows.map((r) => [r.campaign.id, r]));

  const candidateIds = new Set<string>([
    ...currRows.filter((r) => r.campaign.status === "ENABLED").map((r) => r.campaign.id),
    ...currRows.filter((r) => Number(r.metrics.impressions ?? 0) > 1).map((r) => r.campaign.id),
    ]);

  const campaigns: Campaign[] = [];
  for (const id of candidateIds) {
    const currRow = currById.get(id);
    const isActive = currRow?.campaign.status === "ENABLED";
    const curr = toMetricSet(currRow);
    const prev = toMetricSet(prevById.get(id));

  campaigns.push({
    name: currRow?.campaign.name ?? id,
    status: isActive ? "ativa" : "pausada",
    status_note: !isActive ? "Incluída por ter impressões > 1 no período" : undefined,
    objective: currRow?.campaign.advertisingChannelType ?? "—",
    curr,
    prev,
    delta_pct: deltaPct(curr, prev),
  });
  }

  campaigns.sort((a, b) => (b.curr.spend ?? 0) - (a.curr.spend ?? 0));

  if (campaigns.length === 0) {
    return {
      account_id: customerId,
      account_name: accountName,
      mcc: mccName,
      status: "sem_campanhas_ativas",
      note: "Conta confirmada e integração automática funcionando. Nenhuma campanha ativa nem com impressões no período ainda.",
      campaigns: [],
    };
  }

  const consolidatedCurr = sumMetricSet(campaigns, "curr");
  const consolidatedPrev = sumMetricSet(campaigns, "prev");

  return {
    account_id: customerId,
    account_name: accountName,
    mcc: mccName,
    campaigns,
    consolidated: {
      curr: consolidatedCurr,
      prev: consolidatedPrev,
      delta_pct: deltaPct(consolidatedCurr, consolidatedPrev),
    },
    excluded_note: "Campanhas filtradas automaticamente (ativas OU impressões > 1 no período).",
  };
} catch (e: any) {
  // Não derruba o relatório inteiro se o Google Ads falhar — devolve um
  // bloco de erro visível em vez de travar a sincronização do Meta.
  console.error("Erro ao sincronizar Google Ads:", e);
  return {
    account_id: customerId,
    account_name: accountName,
    mcc: mccName,
    status: "erro_sincronizacao",
    note: `Falha ao buscar dados do Google Ads: ${e?.message ?? e}`,
    campaigns: [],
  };
}
}
