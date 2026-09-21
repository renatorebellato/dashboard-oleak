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
