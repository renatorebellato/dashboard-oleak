import { NextRequest, NextResponse } from "next/server";
import { computeLiveWeekPeriod, computeCustomPeriod } from "@/lib/period";
import { fetchMetaPlatformBlock } from "@/lib/metaSync";
import { fetchGooglePlatformBlock } from "@/lib/googleSync";
import type { ReportData } from "@/lib/types";

// Endpoint consumido pelo próprio dashboard (modo "Ao vivo"): busca os
// dados direto do Meta Ads e do Google Ads a cada chamada, sem depender do
// snapshot semanal salvo no Supabase pelo /api/cron/sync. Aceita ?start= e
// ?end= (YYYY-MM-DD) para o filtro de período do dashboard; sem eles, cai no
// período padrão de 7 dias (computeLiveWeekPeriod).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const META_ACCOUNT_ID = "271327700853914";
const META_ACCOUNT_NAME = "OLEAK INDUSTRIA E COMERCIO LTDA";
const GOOGLE_CUSTOMER_ID = "3707738500";
const GOOGLE_ACCOUNT_NAME = "Oleak - Ativa";
const GOOGLE_MCC_NAME = "Elo Criativo";

// Cache em memória bem curto por período: evita bater direto nas APIs do
// Meta/Google se o dashboard for aberto em várias abas ou recarregado várias
// vezes seguidas para o mesmo intervalo de datas.
// (Reseta a cada novo deploy/cold start — não precisa de infra extra.)
const cache = new Map<string, { data: ReportData; expiresAt: number }>();
const CACHE_MS = 60_000; // 60s

function isValidDate(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  const useCustom = isValidDate(startParam) && isValidDate(endParam) && startParam <= endParam;
  const cacheKey = useCustom ? `${startParam}_${endParam}` : "default";

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data);
  }

  const { period, previous_period } = useCustom
    ? computeCustomPeriod(startParam as string, endParam as string)
    : computeLiveWeekPeriod();

  const report: ReportData = {
    generated_at: new Date().toISOString(),
    period,
    previous_period,
    meta: { account_id: META_ACCOUNT_ID, account_name: META_ACCOUNT_NAME, campaigns: [] },
    google: { account_id: GOOGLE_CUSTOMER_ID, account_name: GOOGLE_ACCOUNT_NAME, campaigns: [] },
  };

  // Meta Ads
  try {
    report.meta = await fetchMetaPlatformBlock({
      accountId: META_ACCOUNT_ID,
      accountName: META_ACCOUNT_NAME,
      period,
      previousPeriod: previous_period,
      includeSalesInsights: true,
    });
  } catch (e: any) {
    console.error("Erro ao buscar Meta Ads (live):", e);
    report.meta = {
      account_id: META_ACCOUNT_ID,
      account_name: META_ACCOUNT_NAME,
      campaigns: [],
      status: "erro_sincronizacao",
      note: `Falha ao buscar dados do Meta Ads: ${String(e?.message ?? e)}`,
    };
  }

  // Google Ads (a própria função já trata erro internamente e nunca lança)
  report.google = await fetchGooglePlatformBlock({
    customerId: GOOGLE_CUSTOMER_ID,
    accountName: GOOGLE_ACCOUNT_NAME,
    mccName: GOOGLE_MCC_NAME,
    period,
    previousPeriod: previous_period,
  });

  if (cache.size > 30) cache.clear();
  cache.set(cacheKey, { data: report, expiresAt: Date.now() + CACHE_MS });

  return NextResponse.json(report);
}
