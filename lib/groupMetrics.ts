// Agregações do dashboard de grupo, feitas no navegador a partir dos dados
// somáveis devolvidos por /api/group (ver lib/groupTypes.ts).

import type { GroupAccount, GroupCampaign, GroupDashboardData, RawMetrics, TermRow } from "./groupTypes";

export const ALL = "all";
export type Selection = { account: string; campaign: string };

export const EMPTY: RawMetrics = { spend: 0, impressions: 0, clicks: 0, conversions: 0, eligible: 0, budget_lost: 0, top: 0, abs_top: 0 };

export function addRaw(a: RawMetrics, b: RawMetrics): RawMetrics {
  return {
    spend: a.spend + b.spend,
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    conversions: a.conversions + b.conversions,
    eligible: a.eligible + b.eligible,
    budget_lost: a.budget_lost + b.budget_lost,
    top: a.top + b.top,
    abs_top: a.abs_top + b.abs_top,
  };
}

export const sumRaw = (list: RawMetrics[]) => list.reduce(addRaw, EMPTY);

export type Derived = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number | null; // %
  cpc: number | null;
  cpl: number | null; // custo por lead (conversão)
  convRate: number | null; // % leads / cliques
  budgetLost: number | null; // % (0–100)
  top: number | null;
  absTop: number | null;
};

export function derive(r: RawMetrics): Derived {
  const share = (x: number) => (r.eligible > 0 ? (x / r.eligible) * 100 : null);
  return {
    spend: r.spend,
    impressions: r.impressions,
    clicks: r.clicks,
    conversions: r.conversions,
    ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : null,
    cpc: r.clicks > 0 ? r.spend / r.clicks : null,
    cpl: r.conversions > 0 ? r.spend / r.conversions : null,
    convRate: r.clicks > 0 ? (r.conversions / r.clicks) * 100 : null,
    budgetLost: share(r.budget_lost),
    top: share(r.top),
    absTop: share(r.abs_top),
  };
}

// Variação % (relativa) — null quando não há base de comparação.
export function pctChange(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

// Diferença em pontos percentuais (para parcelas de impressão).
export function ppChange(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null) return null;
  return curr - prev;
}

export type SelectedCampaign = { account: GroupAccount; campaign: GroupCampaign };

export function selectedCampaigns(data: GroupDashboardData, sel: Selection): SelectedCampaign[] {
  const out: SelectedCampaign[] = [];
  for (const account of data.accounts) {
    if (sel.account !== ALL && account.id !== sel.account) continue;
    for (const campaign of account.campaigns) {
      if (sel.campaign !== ALL && campaign.id !== sel.campaign) continue;
      out.push({ account, campaign });
    }
  }
  return out;
}

// ---------- Série temporal (leads x custo por lead) ----------

export type Granularity = "dia" | "semana" | "mês";
export type SeriesPoint = { key: string; label: string; range: string; leads: number; spend: number; cpl: number | null };

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function parse(d: string): Date {
  return new Date(`${d}T00:00:00Z`);
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function ddmm(d: string): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

export function granularityFor(period: { start: string; end: string }): Granularity {
  const days = Math.round((parse(period.end).getTime() - parse(period.start).getTime()) / 86400000) + 1;
  if (days <= 62) return "dia";
  if (days <= 190) return "semana";
  return "mês";
}

function bucketStart(d: Date, g: Granularity): Date {
  const b = new Date(d);
  if (g === "semana") {
    const dow = (b.getUTCDay() + 6) % 7; // segunda = 0
    b.setUTCDate(b.getUTCDate() - dow);
  } else if (g === "mês") {
    b.setUTCDate(1);
  }
  return b;
}

function nextBucket(d: Date, g: Granularity): Date {
  const n = new Date(d);
  if (g === "dia") n.setUTCDate(n.getUTCDate() + 1);
  else if (g === "semana") n.setUTCDate(n.getUTCDate() + 7);
  else n.setUTCMonth(n.getUTCMonth() + 1);
  return n;
}

export function buildSeries(campaigns: GroupCampaign[], period: { start: string; end: string }): { granularity: Granularity; points: SeriesPoint[] } {
  const g = granularityFor(period);
  const start = parse(period.start);
  const end = parse(period.end);

  const buckets = new Map<string, SeriesPoint>();
  for (let b = bucketStart(start, g); b <= end; b = nextBucket(b, g)) {
    const key = fmt(b);
    const from = b < start ? start : b;
    const lastDay = new Date(nextBucket(b, g).getTime() - 86400000);
    const to = lastDay > end ? end : lastDay;
    const label =
      g === "dia" ? ddmm(key) : g === "semana" ? ddmm(fmt(from)) : `${MONTHS[b.getUTCMonth()]}/${String(b.getUTCFullYear()).slice(2)}`;
    const range = g === "dia" ? ddmm(key) : `${ddmm(fmt(from))} a ${ddmm(fmt(to))}`;
    buckets.set(key, { key, label, range, leads: 0, spend: 0, cpl: null });
  }

  for (const c of campaigns) {
    for (const [date, conv, cost] of c.daily) {
      const key = fmt(bucketStart(parse(date), g));
      const p = buckets.get(key);
      if (!p) continue;
      p.leads += conv;
      p.spend += cost;
    }
  }

  const points = [...buckets.values()].map((p) => ({
    ...p,
    leads: Math.round(p.leads * 100) / 100,
    spend: Math.round(p.spend * 100) / 100,
    cpl: p.leads > 0 ? p.spend / p.leads : null,
  }));
  return { granularity: g, points };
}

// ---------- Palavras-chave / termos de pesquisa ----------

export type TopTerm = {
  text: string;
  match?: string;
  accounts: string[]; // ids
  clicks: number;
  conversions: number;
  spend: number;
  impressions: number;
};

export function topTerms(rows: TermRow[], sel: Selection, by: "clicks" | "conversions", n = 10): TopTerm[] {
  const map = new Map<string, TopTerm>();
  for (const r of rows) {
    if (sel.account !== ALL && r.account_id !== sel.account) continue;
    if (sel.campaign !== ALL && r.campaign_id !== sel.campaign) continue;
    const key = `${r.text.toLowerCase()}|${r.match ?? ""}`;
    const t = map.get(key) ?? { text: r.text, match: r.match, accounts: [], clicks: 0, conversions: 0, spend: 0, impressions: 0 };
    if (!t.accounts.includes(r.account_id)) t.accounts.push(r.account_id);
    t.clicks += r.clicks;
    t.conversions += r.conversions;
    t.spend += r.spend;
    t.impressions += r.impressions;
    map.set(key, t);
  }
  const list = [...map.values()].filter((t) => (by === "clicks" ? t.clicks > 0 : t.conversions > 0));
  list.sort((a, b) => (by === "clicks" ? b.clicks - a.clicks || b.conversions - a.conversions : b.conversions - a.conversions || b.clicks - a.clicks));
  return list.slice(0, n);
}
