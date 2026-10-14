// Busca no Google Ads tudo o que o dashboard de grupo precisa (ex: Grupo
// Meddi, uma conta por unidade): campanhas com parcelas de impressão,
// série diária, principais palavras-chave e termos de pesquisa — de todas as
// contas da MCC cujo nome contém o filtro do cliente.

import { formatCustomerId, listMccAccountsByName, runGaqlRaw, shortAccountName } from "./googleSync";
import type { DailyRow, GroupAccount, GroupCampaign, RawMetrics, TermRow } from "./groupTypes";

const TERMS_PER_QUERY = 100; // por conta, por ordenação (cliques e conversões)
const ACCOUNT_CONCURRENCY = 6; // contas buscadas ao mesmo tempo

type Period = { start: string; end: string };

type CampaignRow = {
  campaign: { id: string; name: string; status: string; advertisingChannelType?: string };
  metrics: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: number;
    searchImpressionShare?: number;
    searchBudgetLostImpressionShare?: number;
    searchTopImpressionShare?: number;
    searchAbsoluteTopImpressionShare?: number;
  };
};

type DailyApiRow = {
  campaign: { id: string };
  segments: { date: string };
  metrics: { costMicros?: string; conversions?: number };
};

type KeywordApiRow = {
  campaign: { id: string };
  adGroup: { id: string };
  adGroupCriterion: { criterionId: string; keyword?: { text?: string; matchType?: string } };
  metrics: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number };
};

type SearchTermApiRow = {
  campaign: { id: string };
  adGroup: { id: string };
  searchTermView: { searchTerm?: string };
  metrics: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number };
};

export const EMPTY_RAW: RawMetrics = { spend: 0, impressions: 0, clicks: 0, conversions: 0, eligible: 0, budget_lost: 0, top: 0, abs_top: 0 };

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const money = (micros: unknown) => num(micros) / 1_000_000;
const r2 = (v: number) => Math.round(v * 100) / 100;

function toRaw(row: CampaignRow | undefined): RawMetrics {
  if (!row) return { ...EMPTY_RAW };
  const m = row.metrics;
  const impressions = num(m.impressions);
  const is = num(m.searchImpressionShare);
  // Parcelas só existem para a rede de Pesquisa; sem parcela, a campanha não
  // entra na média ponderada (eligible = 0).
  const eligible = is > 0 ? impressions / is : 0;
  return {
    spend: r2(money(m.costMicros)),
    impressions,
    clicks: num(m.clicks),
    conversions: r2(num(m.conversions)),
    eligible: Math.round(eligible),
    budget_lost: Math.round(num(m.searchBudgetLostImpressionShare) * eligible),
    top: Math.round(num(m.searchTopImpressionShare) * eligible),
    abs_top: Math.round(num(m.searchAbsoluteTopImpressionShare) * eligible),
  };
}

const CAMPAIGN_FIELDS = `campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
  metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions,
  metrics.search_impression_share, metrics.search_budget_lost_impression_share,
  metrics.search_top_impression_share, metrics.search_absolute_top_impression_share`;

const BASIC_CAMPAIGN_FIELDS = `campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
  metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions`;

const between = (p: Period) => `segments.date BETWEEN '${p.start}' AND '${p.end}'`;

// Campanhas com as parcelas de impressão; se a API recusar essas métricas
// nesta conta, refaz sem elas (os indicadores de parcela ficam "—").
async function campaignRows(customerId: string, p: Period): Promise<CampaignRow[]> {
  try {
    return await runGaqlRaw<CampaignRow>(customerId, `SELECT ${CAMPAIGN_FIELDS} FROM campaign WHERE ${between(p)}`);
  } catch (e) {
    console.error("Parcelas de impressão indisponíveis, buscando sem elas:", e);
    return runGaqlRaw<CampaignRow>(customerId, `SELECT ${BASIC_CAMPAIGN_FIELDS} FROM campaign WHERE ${between(p)}`);
  }
}

async function safe<T>(p: Promise<T[]>): Promise<T[]> {
  try {
    return await p;
  } catch (e) {
    console.error("Consulta opcional do Google Ads falhou:", e);
    return [];
  }
}

async function fetchAccount(acc: { id: string; name: string }, label: string, period: Period, prev: Period): Promise<{
  account: GroupAccount;
  keywords: TermRow[];
  search_terms: TermRow[];
}> {
  const accountId = formatCustomerId(acc.id);
  try {
    const [currRows, prevRows, dailyRows] = await Promise.all([
      campaignRows(acc.id, period),
      campaignRows(acc.id, prev),
      runGaqlRaw<DailyApiRow>(
        acc.id,
        `SELECT campaign.id, segments.date, metrics.cost_micros, metrics.conversions
         FROM campaign WHERE ${between(period)} AND metrics.impressions > 0`
      ),
    ]);

    const prevById = new Map(prevRows.map((r) => [String(r.campaign.id), r]));
    const dailyById = new Map<string, DailyRow[]>();
    for (const r of dailyRows) {
      const id = String(r.campaign.id);
      const list = dailyById.get(id) ?? [];
      list.push([r.segments.date, r2(num(r.metrics.conversions)), r2(money(r.metrics.costMicros))]);
      dailyById.set(id, list);
    }

    // Mesma regra do resto do dashboard: campanhas ativas OU com mais de 1
    // impressão no período.
    const campaigns: GroupCampaign[] = currRows
      .filter((r) => r.campaign.status === "ENABLED" || num(r.metrics.impressions) > 1)
      .map((r) => {
        const id = String(r.campaign.id);
        return {
          id,
          name: r.campaign.name,
          status: r.campaign.status === "ENABLED" ? "ativa" : "pausada",
          channel: r.campaign.advertisingChannelType ?? "—",
          curr: toRaw(r),
          prev: toRaw(prevById.get(id)),
          daily: (dailyById.get(id) ?? []).sort((a, b) => a[0].localeCompare(b[0])),
        } as GroupCampaign;
      })
      .sort((a, b) => b.curr.spend - a.curr.spend);

    const campaignIds = new Set(campaigns.map((c) => c.id));

    // Palavras-chave e termos de pesquisa: as N maiores por cliques e as N
    // maiores por conversões, por conta. São opcionais — se falharem, o resto
    // do dashboard continua.
    const kwBase = `SELECT campaign.id, ad_group.id, ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
        metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros
      FROM keyword_view WHERE ${between(period)}`;
    const stBase = `SELECT campaign.id, ad_group.id, search_term_view.search_term,
        metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros
      FROM search_term_view WHERE ${between(period)}`;

    const [kwClicks, kwConv, stClicks, stConv] = await Promise.all([
      safe(runGaqlRaw<KeywordApiRow>(acc.id, `${kwBase} AND metrics.clicks > 0 ORDER BY metrics.clicks DESC LIMIT ${TERMS_PER_QUERY}`)),
      safe(runGaqlRaw<KeywordApiRow>(acc.id, `${kwBase} AND metrics.conversions > 0 ORDER BY metrics.conversions DESC LIMIT ${TERMS_PER_QUERY}`)),
      safe(runGaqlRaw<SearchTermApiRow>(acc.id, `${stBase} AND metrics.clicks > 0 ORDER BY metrics.clicks DESC LIMIT ${TERMS_PER_QUERY}`)),
      safe(runGaqlRaw<SearchTermApiRow>(acc.id, `${stBase} AND metrics.conversions > 0 ORDER BY metrics.conversions DESC LIMIT ${TERMS_PER_QUERY}`)),
    ]);

    const keywords = new Map<string, TermRow>();
    for (const r of [...kwClicks, ...kwConv]) {
      const key = `${r.adGroup.id}:${r.adGroupCriterion.criterionId}`;
      const text = r.adGroupCriterion.keyword?.text;
      if (!text || keywords.has(key) || !campaignIds.has(String(r.campaign.id))) continue;
      keywords.set(key, {
        account_id: accountId,
        campaign_id: String(r.campaign.id),
        text,
        match: r.adGroupCriterion.keyword?.matchType,
        impressions: num(r.metrics.impressions),
        clicks: num(r.metrics.clicks),
        conversions: r2(num(r.metrics.conversions)),
        spend: r2(money(r.metrics.costMicros)),
      });
    }

    const terms = new Map<string, TermRow>();
    for (const r of [...stClicks, ...stConv]) {
      const text = r.searchTermView.searchTerm;
      const key = `${r.adGroup.id}:${text}`;
      if (!text || terms.has(key) || !campaignIds.has(String(r.campaign.id))) continue;
      terms.set(key, {
        account_id: accountId,
        campaign_id: String(r.campaign.id),
        text,
        impressions: num(r.metrics.impressions),
        clicks: num(r.metrics.clicks),
        conversions: r2(num(r.metrics.conversions)),
        spend: r2(money(r.metrics.costMicros)),
      });
    }

    return {
      account: { id: accountId, name: label, campaigns },
      keywords: [...keywords.values()],
      search_terms: [...terms.values()],
    };
  } catch (e: any) {
    console.error(`Erro ao buscar a conta ${acc.name}:`, e);
    return {
      account: {
        id: accountId,
        name: label,
        status: "erro_sincronizacao",
        note: String(e?.message ?? e).slice(0, 300),
        campaigns: [],
      },
      keywords: [],
      search_terms: [],
    };
  }
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function fetchGroupDashboard(opts: { nameFilter: string; period: Period; previousPeriod: Period }) {
  const { nameFilter, period, previousPeriod } = opts;
  const mccAccounts = await listMccAccountsByName(nameFilter);
  const results = await mapLimited(mccAccounts, ACCOUNT_CONCURRENCY, (acc) =>
    fetchAccount(acc, shortAccountName(acc.name, nameFilter), period, previousPeriod)
  );

  const accounts = results.map((r) => r.account);
  const spendOf = (a: GroupAccount) => a.campaigns.reduce((s, c) => s + c.curr.spend, 0);
  accounts.sort((a, b) => spendOf(b) - spendOf(a) || a.name.localeCompare(b.name, "pt-BR"));

  return {
    accounts,
    keywords: results.flatMap((r) => r.keywords),
    search_terms: results.flatMap((r) => r.search_terms),
  };
}
