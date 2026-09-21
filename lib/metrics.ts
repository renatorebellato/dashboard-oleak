import type { MetricSet } from "./types";

// Variação percentual curr vs prev, com arredondamento de 1 casa decimal.
// prev = 0 e curr = 0 -> 0%. prev = 0 e curr > 0 -> null (variação infinita,
// não faz sentido mostrar um número).
export function pct(curr?: number | null, prev?: number | null): number | null {
  if (curr == null || prev == null) return null;
  if (prev === 0) return curr === 0 ? 0 : null;
  return Number((((curr - prev) / prev) * 100).toFixed(1));
}

export function deltaPct(curr: MetricSet, prev: MetricSet): Record<string, number | null> {
  const keys: (keyof MetricSet)[] = [
    "spend",
    "impressions",
    "clicks",
    "ctr",
    "cpc",
    "conversions",
    "conv_value",
    "cpa",
    "roas",
    "results",
    "frequency",
  ];
  const out: Record<string, number | null> = {};
  for (const k of keys) {
    const c = curr[k];
    const p = prev[k];
    if (typeof c === "number" && typeof p === "number") {
      out[k] = pct(c, p);
    }
  }
  return out;
}

export function round(n: number, decimals = 2): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

// Combina dois conjuntos de métricas de plataformas diferentes (ex: Meta +
// Google) somando os valores brutos e recalculando as métricas derivadas
// (CTR, CPC, CPA, ROAS) a partir da soma — nunca soma os percentuais/ratios
// diretamente, senão o resultado fica matematicamente errado.
export function combineMetricSets(a?: MetricSet | null, b?: MetricSet | null): MetricSet {
  const spend = round((a?.spend ?? 0) + (b?.spend ?? 0), 2);
  const impressions = (a?.impressions ?? 0) + (b?.impressions ?? 0);
  const clicks = (a?.clicks ?? 0) + (b?.clicks ?? 0);
  const conversions = (a?.conversions ?? 0) + (b?.conversions ?? 0) || null;
  const conv_value = round((a?.conv_value ?? 0) + (b?.conv_value ?? 0), 2) || null;
  const ctr = impressions > 0 ? round((clicks / impressions) * 100, 2) : 0;
  const cpc = clicks > 0 ? round(spend / clicks, 4) : null;
  const cpa = conversions ? round(spend / conversions, 4) : null;
  const roas = conv_value && spend > 0 ? round(conv_value / spend, 6) : null;
  return { spend, impressions, clicks, ctr, cpc, conversions, conv_value, cpa, roas };
}
