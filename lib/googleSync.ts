import type { AccountSummary, Campaign, MetricSet, PlatformBlock } from "./types";
import { deltaPct, round } from "./metrics";

// Versão da Google Ads API. A Google desativa versões antigas com um aviso
// de ~1 ano de antecedência — atualize periodicamente.
// https://developers.google.com/google-ads/api/docs/release-notes
const API_VERSION = "v23";

// O access token do Google vale ~1h. Guardamos em memória para não renovar a
// cada consulta (um cliente multi-conta faz dezenas de consultas por carga).
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
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
  const ttlMs = Math.max(60, Number(json.expires_in ?? 3600) - 300) * 1000;
  cachedToken = { value: json.access_token as string, expiresAt: Date.now() + ttlMs };
  return cachedToken.value;
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
  return runGaqlRaw<GaqlRow>(customerId, query);
}

async function runGaqlRaw<T>(customerId: string, query: string): Promise<T[]> {
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
const rows: T[] = [];
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
  const cpc = clicks > 0 ? round(spend / clicks, 4) : null;
  const cpa = conversions ? round(spend / conversions, 4) : null;
  const roas = conv_value && spend > 0 ? round(conv_value / spend, 6) : null;
  return { spend, impressions, clicks, ctr, cpc, conversions, conv_value, cpa, roas };
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

// ============================================================
// Clientes com várias contas (ex: Grupo Meddi — uma conta por unidade)
// ============================================================

type CustomerClientRow = {
  customerClient: { id: string; descriptiveName?: string; manager?: boolean; status?: string };
};

export type MccAccount = { id: string; name: string };

// Lista as contas (não-gerenciadoras, ativas) da MCC cujo nome contém o
// filtro, sem diferenciar maiúsculas. Ex: filtro "[Meddi]" pega
// "[Meddi] Multimagem - Salvador", "[Meddi] IHEF Vacinas" etc.
export async function listMccAccountsByName(nameFilter: string): Promise<MccAccount[]> {
  const mcc = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  if (!mcc) throw new Error("GOOGLE_ADS_LOGIN_CUSTOMER_ID não configurado.");
  const rows = await runGaqlRaw<CustomerClientRow>(
    mcc,
    `SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.status
     FROM customer_client
     WHERE customer_client.manager = false AND customer_client.status = 'ENABLED'`
  );
  const needle = nameFilter.trim().toLowerCase();
  const seen = new Set<string>();
  const out: MccAccount[] = [];
  for (const r of rows) {
    const id = String(r.customerClient.id);
    const name = r.customerClient.descriptiveName ?? id;
    if (!name.toLowerCase().includes(needle) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// Nome curto da unidade: tira o filtro do começo ("[Meddi] Multimagem -
// Salvador" -> "Multimagem - Salvador").
function shortAccountName(name: string, nameFilter: string): string {
  const idx = name.toLowerCase().indexOf(nameFilter.trim().toLowerCase());
  if (idx < 0) return name;
  const cleaned = (name.slice(0, idx) + name.slice(idx + nameFilter.trim().length)).replace(/\s+/g, " ").trim();
  return cleaned.replace(/^[-–:·|]\s*/, "") || name;
}

function formatCustomerId(id: string): string {
  const d = id.replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : id;
}

const EMPTY_METRICS: MetricSet = { spend: 0, impressions: 0, clicks: 0, ctr: 0, conversions: null, conv_value: null, cpa: null, roas: null };

// Monta UM bloco do Google Ads somando todas as contas da MCC que batem com o
// filtro: campanhas de todas as contas (marcadas com a unidade), consolidado
// geral e um resumo por conta. Cada conta é buscada em paralelo; se uma
// falhar, ela aparece com erro no resumo e as outras seguem normalmente.
export async function fetchGoogleGroupBlock(opts: {
  nameFilter: string;
  groupName: string;
  mccName?: string;
  period: { start: string; end: string };
  previousPeriod: { start: string; end: string };
}): Promise<PlatformBlock> {
  const { nameFilter, groupName, mccName, period, previousPeriod } = opts;

  let accounts: MccAccount[];
  try {
    accounts = await listMccAccountsByName(nameFilter);
  } catch (e: any) {
    console.error("Erro ao listar contas da MCC:", e);
    return {
      account_id: nameFilter,
      account_name: groupName,
      mcc: mccName,
      status: "erro_sincronizacao",
      note: `Falha ao listar as contas da MCC: ${e?.message ?? e}`,
      campaigns: [],
    };
  }

  if (accounts.length === 0) {
    return {
      account_id: nameFilter,
      account_name: groupName,
      mcc: mccName,
      status: "sem_contas",
      note: `Nenhuma conta ativa na MCC com "${nameFilter}" no nome.`,
      campaigns: [],
    };
  }

  const blocks = await Promise.all(
    accounts.map(async (acc) => {
      const label = shortAccountName(acc.name, nameFilter);
      const block = await fetchGooglePlatformBlock({
        customerId: acc.id,
        accountName: label,
        mccName,
        period,
        previousPeriod,
      });
      return { acc, label, block };
    })
  );

  const campaigns: Campaign[] = [];
  const summaries: AccountSummary[] = [];
  for (const { acc, label, block } of blocks) {
    const tagged = block.campaigns.map((c) => ({ ...c, account_id: formatCustomerId(acc.id), account_name: label }));
    campaigns.push(...tagged);
    const curr = block.consolidated?.curr ?? EMPTY_METRICS;
    const prev = block.consolidated?.prev ?? EMPTY_METRICS;
    summaries.push({
      account_id: formatCustomerId(acc.id),
      account_name: label,
      status: block.status,
      note: block.status === "erro_sincronizacao" ? block.note : undefined,
      campaigns_total: tagged.length,
      campaigns_active: tagged.filter((c) => c.status === "ativa").length,
      curr,
      prev,
      delta_pct: block.consolidated?.delta_pct ?? {},
    });
  }

  campaigns.sort((a, b) => (b.curr.spend ?? 0) - (a.curr.spend ?? 0));
  summaries.sort((a, b) => (b.curr.spend ?? 0) - (a.curr.spend ?? 0));

  const failed = summaries.filter((s) => s.status === "erro_sincronizacao");
  const base: PlatformBlock = {
    account_id: `${accounts.length} contas`,
    account_name: groupName,
    mcc: mccName,
    campaigns,
    accounts: summaries,
    excluded_note: `Contas da MCC com "${nameFilter}" no nome. Campanhas filtradas automaticamente (ativas OU impressões > 1 no período).`,
  };
  if (failed.length > 0) {
    base.note = `Não foi possível buscar ${failed.length} conta(s): ${failed.map((f) => f.account_name).join(", ")}.`;
  }

  if (campaigns.length === 0) {
    return { ...base, status: failed.length === accounts.length ? "erro_sincronizacao" : "sem_campanhas_ativas", note: base.note ?? "Nenhuma campanha ativa nem com impressões no período." };
  }

  const consolidatedCurr = sumMetricSet(campaigns, "curr");
  const consolidatedPrev = sumMetricSet(campaigns, "prev");
  return {
    ...base,
    consolidated: { curr: consolidatedCurr, prev: consolidatedPrev, delta_pct: deltaPct(consolidatedCurr, consolidatedPrev) },
  };
}

// Escolhe entre conta única e grupo de contas conforme o cadastro do cliente.
// Usado pela rota ao vivo e pelo cron semanal.
export async function fetchGoogleForClient(
  client: {
    name: string;
    google_customer_id: string | null;
    google_account_name: string | null;
    google_mcc_name: string | null;
    google_account_filter?: string | null;
  },
  period: { start: string; end: string },
  previousPeriod: { start: string; end: string }
): Promise<PlatformBlock | null> {
  const mccName = client.google_mcc_name ?? "Elo Criativo";
  if (client.google_account_filter && client.google_account_filter.trim()) {
    return fetchGoogleGroupBlock({
      nameFilter: client.google_account_filter,
      groupName: client.google_account_name ?? client.name,
      mccName,
      period,
      previousPeriod,
    });
  }
  if (client.google_customer_id) {
    return fetchGooglePlatformBlock({
      customerId: client.google_customer_id,
      accountName: client.google_account_name ?? client.name,
      mccName,
      period,
      previousPeriod,
    });
  }
  return null;
}
