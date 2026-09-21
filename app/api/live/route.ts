import { NextResponse } from "next/server";
import { computeLiveWeekPeriod } from "@/lib/period";
import { fetchMetaPlatformBlock } from "@/lib/metaSync";
import { fetchGooglePlatformBlock } from "@/lib/googleSync";
import type { ReportData } from "@/lib/types";

// Endpoint consumido pelo próprio dashboard (modo "Ao vivo"): busca os
// dados direto do Meta Ads e do Google Ads a cada chamada, sem depender do
// snapshot semanal salvo no Supabase pelo /api/cron/sync.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const META_ACCOUNT_ID = "271327700853914";
const META_ACCOUNT_NAME = "OLEAK INDUSTRIA E COMERCIO LTDA";
const GOOGLE_CUSTOMER_ID = "3707738500";
const GOOGLE_ACCOUNT_NAME = "Oleak - Ativa";
const GOOGLE_MCC_NAME = "Elo Criativo";

// Cache em memória bem curto: evita bater direto nas APIs do Meta/Google se
// o dashboard for aberto em várias abas ou recarregado várias vezes seguidas.
// (Reseta a cada novo deploy/cold start — não precisa de infra extra.)
let cache: { data: ReportData; expiresAt: number } | null = null;
const CACHE_MS = 60_000; // 60s

export async function GET() {
  if (cache && cache.expiresAt > Date.now()) {
    return NextResponse.json(cache.data);
  }

  const { period, previous_period } = computeLiveWeekPeriod();

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

  cache = { data: report, expiresAt: Date.now() + CACHE_MS };

  return NextResponse.json(report);
}
