import crypto from "crypto";
import type { Campaign, MetricSet, PlatformBlock, TopAd, DailySalesPoint } from "./types";
import { deltaPct, round } from "./metrics";

// Versão da Graph API / Marketing API. Atualize periodicamente — a Meta
// desativa versões antigas em ~2 anos.
// https://developers.facebook.com/docs/graph-api/changelog/versions/
const GRAPH_VERSION = "v26.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Tipos de "resultado" considerados conversão, em ordem de prioridade
// (o primeiro que aparecer com valor > 0 vira o "resultado principal" da
// campanha/anúncio). Ajuste esta lista se a Oleak passar a rodar campanhas
// com outros objetivos (ex: WhatsApp, cadastro em formulário nativo etc).
const RESULT_ACTION_TYPES = [
  "offsite_conversion.fb_pixel_purchase",
  "onsite_conversion.purchase",
  "purchase",
  "omni_purchase",
  "lead",
  "onsite_conversion.lead_grouped",
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.total_messaging_connection",
];

const RESULT_LABELS: Record<string, string> = {
  "offsite_conversion.fb_pixel_purchase": "Compras no site",
  "onsite_conversion.purchase": "Compras no site",
  purchase: "Compras no site",
  omni_purchase: "Compras no site",
  lead: "Cadastros (leads)",
  "onsite_conversion.lead_grouped": "Cadastros (leads)",
  "onsite_conversion.messaging_conversation_started_7d": "Conversas iniciadas",
  "onsite_conversion.total_messaging_connection": "Conversas iniciadas",
};

// Subconjunto de RESULT_ACTION_TYPES que representa especificamente COMPRAS
// (não leads/conversas) — usado no gráfico diário e no destaque de anúncios,
// que só fazem sentido para campanhas com objetivo de vendas.
const PURCHASE_ACTION_TYPES = [
  "offsite_conversion.fb_pixel_purchase",
  "onsite_conversion.purchase",
  "purchase",
  "omni_purchase",
];

// Objetivos de campanha considerados "de vendas" (taxonomia nova da Meta e a
// legada, que ainda aparece em campanhas mais antigas).
const SALES_OBJECTIVES = ["OUTCOME_SALES", "CONVERSIONS"];

function appSecretProof(accessToken: string, appSecret: string): string {
  return crypto.createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

async function metaFetch(path: string, params: Record<string, string>): Promise<any> {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const appSecret = process.env.META_APP_SECRET;
  if (!accessToken || !appSecret) {
    throw new Error("META_ACCESS_TOKEN ou META_APP_SECRET não configurados.");
  }
  const qp = new URLSearchParams({
    ...params,
    access_token: accessToken,
    appsecret_proof: appSecretProof(accessToken, appSecret),
  });
  const res = await fetch(`${GRAPH_BASE}${path}?${qp.toString()}`);
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`Meta API error (${path}): ${JSON.stringify(json.error ?? json)}`);
  }
  return json;
}

type MetaCampaignMeta = {
  id: string;
  name: string;
  objective: string;
  effective_status: string;
};

async function fetchAllPages(path: string, params: Record<string, string>): Promise<any[]> {
  const out: any[] = [];
  let json = await metaFetch(path, params);
  out.push(...(json.data ?? []));
  let next = json.paging?.next as string | undefined;
  let guard = 0;
  while (next && guard < 20) {
    const res = await fetch(next);
    json = await res.json();
    out.push(...(json.data ?? []));
    next = json.paging?.next;
    guard++;
  }
  return out;
}

async function fetchCampaignsMeta(accountId: string): Promise<Record<string, MetaCampaignMeta>> {
  const rows = await fetchAllPages(`/act_${accountId}/campaigns`, {
    fields: "id,name,objective,effective_status",
    limit: "500",
  });
  const out: Record<string, MetaCampaignMeta> = {};
  for (const c of rows) out[c.id] = c;
  return out;
}

async function fetchInsights(accountId: string, since: string, until: string): Promise<any[]> {
  return fetchAllPages(`/act_${accountId}/insights`, {
    level: "campaign",
    time_range: JSON.stringify({ since, until }),
    fields:
      "campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,frequency,actions,action_values",
    limit: "500",
  });
}

function extractActionValue(actions: any[] | undefined, types: string[]): number {
  if (!actions) return 0;
  for (const t of types) {
    const found = actions.find((a) => a.action_type === t);
    if (found) return Number(found.value);
  }
  return 0;
}

function primaryResult(actions: any[] | undefined): { count: number; label?: string } {
  if (!actions || actions.length === 0) return { count: 0 };
  let best: { type: string; value: number } | null = null;
  for (const a of actions) {
    if (!RESULT_ACTION_TYPES.includes(a.action_type)) continue;
    const v = Number(a.value);
    if (!best || v > best.value) best = { type: a.action_type, value: v };
  }
  if (!best) return { count: 0 };
  return { count: best.value, label: RESULT_LABELS[best.type] ?? best.type };
}

function toMetricSet(row: any | undefined): { metrics: MetricSet; resultLabel?: string } {
  const spend = Number(row?.spend ?? 0);
  const impressions = Number(row?.impressions ?? 0);
  const clicks = Number(row?.clicks ?? 0);
  const ctr = row?.ctr != null ? Number(row.ctr) : impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = row?.cpc != null ? Number(row.cpc) : clicks > 0 ? spend / clicks : null;
  const frequency = row?.frequency != null ? Number(row.frequency) : null;
  const { count: conversions, label } = primaryResult(row?.actions);
  const conv_value = extractActionValue(row?.action_values, RESULT_ACTION_TYPES);
  const cpa = conversions > 0 ? spend / conversions : null;
  const roas = spend > 0 && conv_value > 0 ? conv_value / spend : null;
  return {
    metrics: {
      spend: round(spend, 2),
      impressions,
      clicks,
      ctr: round(ctr, 2),
      cpc: cpc != null ? round(cpc, 4) : null,
      conversions: conversions || null,
      conv_value: conv_value || null,
      cpa: cpa != null ? round(cpa, 4) : null,
      roas: roas != null ? round(roas, 6) : null,
      frequency: frequency != null ? round(frequency, 4) : null,
    },
    resultLabel: label,
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

// --- Série diária de compras + ROAS, restrita às campanhas de vendas ---

async function fetchDailySalesInsights(
  accountId: string,
  campaignIds: string[],
  since: string,
  until: string
): Promise<any[]> {
  if (campaignIds.length === 0) return [];
  return fetchAllPages(`/act_${accountId}/insights`, {
    level: "campaign",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    filtering: JSON.stringify([{ field: "campaign.id", operator: "IN", value: campaignIds }]),
    fields: "date_start,spend,actions,action_values",
    limit: "500",
  });
}

function buildDailySalesSeries(rows: any[]): DailySalesPoint[] {
  const byDate = new Map<string, { spend: number; purchases: number; conv_value: number }>();
  for (const row of rows) {
    const date = row.date_start as string;
    const bucket = byDate.get(date) ?? { spend: 0, purchases: 0, conv_value: 0 };
    bucket.spend += Number(row.spend ?? 0);
    bucket.purchases += extractActionValue(row.actions, PURCHASE_ACTION_TYPES);
    bucket.conv_value += extractActionValue(row.action_values, PURCHASE_ACTION_TYPES);
    byDate.set(date, bucket);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, b]) => ({
      date,
      purchases: Math.round(b.purchases),
      spend: round(b.spend, 2),
      conv_value: round(b.conv_value, 2),
      roas: b.spend > 0 && b.conv_value > 0 ? round(b.conv_value / b.spend, 4) : null,
    }));
}

// --- Anúncios destaque (maior ROAS e mais compras), com preview do criativo ---

async function fetchAdCreatives(
  adIds: string[]
): Promise<Record<string, { image_url?: string; thumbnail_url?: string }>> {
  if (adIds.length === 0) return {};
  const json = await metaFetch("", {
    ids: adIds.join(","),
    fields: "creative{thumbnail_url,image_url}",
  });
  const out: Record<string, { image_url?: string; thumbnail_url?: string }> = {};
  for (const id of adIds) {
    const c = json[id]?.creative;
    if (c) out[id] = { image_url: c.image_url, thumbnail_url: c.thumbnail_url };
  }
  return out;
}

async function fetchTopSalesAds(
  accountId: string,
  campaignIds: string[],
  since: string,
  until: string
): Promise<{ top_ad_roas?: TopAd; top_ad_conversions?: TopAd }> {
  if (campaignIds.length === 0) return {};

  const rows = await fetchAllPages(`/act_${accountId}/insights`, {
    level: "ad",
    time_range: JSON.stringify({ since, until }),
    filtering: JSON.stringify([{ field: "campaign.id", operator: "IN", value: campaignIds }]),
    fields: "ad_id,ad_name,campaign_name,spend,actions,action_values",
    limit: "500",
  });

  type Candidate = {
    ad_id: string;
    name: string;
    campaign: string;
    spend: number;
    conversions: number;
    conv_value: number;
    roas: number | null;
  };

  const candidates: Candidate[] = rows
    .map((r: any) => {
      const spend = Number(r.spend ?? 0);
      const conversions = extractActionValue(r.actions, PURCHASE_ACTION_TYPES);
      const conv_value = extractActionValue(r.action_values, PURCHASE_ACTION_TYPES);
      const roas = spend > 0 && conv_value > 0 ? conv_value / spend : null;
      return {
        ad_id: r.ad_id as string,
        name: (r.ad_name as string) ?? (r.ad_id as string),
        campaign: r.campaign_name as string,
        spend: round(spend, 2),
        conversions: Math.round(conversions),
        conv_value: round(conv_value, 2),
        roas: roas != null ? round(roas, 6) : null,
      };
    })
    .filter((c: Candidate) => c.conversions > 0);

  if (candidates.length === 0) return {};

  const byRoas = [...candidates].sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))[0];
  const byConversions = [...candidates].sort((a, b) => b.conversions - a.conversions)[0];

  const ids = Array.from(new Set([byRoas.ad_id, byConversions.ad_id]));
  let creatives: Record<string, { image_url?: string; thumbnail_url?: string }> = {};
  try {
    creatives = await fetchAdCreatives(ids);
  } catch (e) {
    console.error("Erro ao buscar criativos dos anúncios destaque:", e);
  }

  const toTopAd = (c: Candidate): TopAd => ({
    name: c.name,
    campaign: c.campaign,
    spend: c.spend,
    conversions: c.conversions,
    conv_value: c.conv_value,
    roas: c.roas ?? 0,
    image_url: creatives[c.ad_id]?.image_url,
    thumbnail_url: creatives[c.ad_id]?.thumbnail_url,
  });

  return {
    top_ad_roas: toTopAd(byRoas),
    top_ad_conversions: toTopAd(byConversions),
  };
}

export async function fetchMetaPlatformBlock(opts: {
  accountId: string;
  accountName: string;
  period: { start: string; end: string };
  previousPeriod: { start: string; end: string };
  // Quando true, também busca a série diária de compras/ROAS e os anúncios
  // destaque (chamadas extras à API — só vale a pena no modo Ao vivo, não no
  // snapshot semanal salvo, que nunca exibe esse gráfico).
  includeSalesInsights?: boolean;
}): Promise<PlatformBlock> {
  const { accountId, accountName, period, previousPeriod, includeSalesInsights } = opts;

  const [campaignsMeta, currInsights, prevInsights] = await Promise.all([
    fetchCampaignsMeta(accountId),
    fetchInsights(accountId, period.start, period.end),
    fetchInsights(accountId, previousPeriod.start, previousPeriod.end),
  ]);

  const currById = new Map(currInsights.map((r) => [r.campaign_id as string, r]));
  const prevById = new Map(prevInsights.map((r) => [r.campaign_id as string, r]));

  // Universo de campanhas candidatas: ativas no cadastro OU com insight no
  // período atual (que pode ter impressões > 1 mesmo pausada).
  const candidateIds = new Set<string>([
    ...Object.keys(campaignsMeta).filter((id) => campaignsMeta[id].effective_status === "ACTIVE"),
    ...currInsights.map((r) => r.campaign_id as string),
  ]);

  const campaigns: Campaign[] = [];
  const salesCampaignIds: string[] = [];

  for (const id of candidateIds) {
    const meta = campaignsMeta[id];
    const currRow = currById.get(id);
    const impressions = Number(currRow?.impressions ?? 0);
    const isActive = meta?.effective_status === "ACTIVE";

    // Regra da Oleak: ativa OU impressões > 1 no período.
    if (!isActive && impressions <= 1) continue;

    const { metrics: curr, resultLabel } = toMetricSet(currRow);
    const { metrics: prev } = toMetricSet(prevById.get(id));

    campaigns.push({
      name: meta?.name ?? (currRow?.campaign_name as string) ?? id,
      status: isActive ? "ativa" : "pausada",
      status_note: !isActive ? "Incluída por ter impressões > 1 no período" : undefined,
      objective: meta?.objective ?? "—",
      result_label: resultLabel,
      curr,
      prev,
      delta_pct: deltaPct(curr, prev),
    });

    if (SALES_OBJECTIVES.includes(meta?.objective ?? "")) {
      salesCampaignIds.push(id);
    }
  }

  campaigns.sort((a, b) => (b.curr.spend ?? 0) - (a.curr.spend ?? 0));

  const consolidatedCurr = sumMetricSet(campaigns, "curr");
  const consolidatedPrev = sumMetricSet(campaigns, "prev");

  const block: PlatformBlock = {
    account_id: accountId,
    account_name: accountName,
    campaigns,
    consolidated: {
      curr: consolidatedCurr,
      prev: consolidatedPrev,
      delta_pct: deltaPct(consolidatedCurr, consolidatedPrev),
    },
    excluded_note: `Campanhas filtradas automaticamente (ativas OU impressões > 1 no período).`,
  };

  if (includeSalesInsights && salesCampaignIds.length > 0) {
    try {
      const [dailyRows, topAds] = await Promise.all([
        fetchDailySalesInsights(accountId, salesCampaignIds, period.start, period.end),
        fetchTopSalesAds(accountId, salesCampaignIds, period.start, period.end),
      ]);
      block.daily_sales = buildDailySalesSeries(dailyRows);
      block.top_ad_roas = topAds.top_ad_roas;
      block.top_ad_conversions = topAds.top_ad_conversions;
    } catch (e: any) {
      // Não derruba o relatório inteiro por causa do gráfico/destaque —
      // as métricas principais continuam valendo mesmo se isso falhar.
      console.error("Erro ao buscar insights diários/anúncios destaque (Meta):", e);
    }
  }

  return block;
}
