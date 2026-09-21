import { NextRequest, NextResponse } from "next/server";
import { computeLiveWeekPeriod, computeCustomPeriod } from "@/lib/period";
import { fetchMetaPlatformBlock } from "@/lib/metaSync";
import { fetchGooglePlatformBlock } from "@/lib/googleSync";
import { requireClient } from "@/lib/session";
import type { ReportData } from "@/lib/types";

// Endpoint consumido pelo próprio dashboard (modo "Ao vivo"): busca os
// dados direto do Meta Ads e do Google Ads a cada chamada, sem depender do
// snapshot semanal salvo no Supabase pelo /api/cron/sync. Aceita ?start= e
// ?end= (YYYY-MM-DD) para o filtro de período do dashboard; sem eles, cai no
// período padrão de 7 dias (computeLiveWeekPeriod). O cliente é resolvido
// pelo cookie de sessão — nunca por um parâmetro vindo do navegador.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const cache = new Map<string, { data: ReportData; expiresAt: number }>();
const CACHE_MS = 60_000; // 60s

function isValidDate(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(req: NextRequest) {
  const client = await requireClient(req);
  if (!client) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  const useCustom = isValidDate(startParam) && isValidDate(endParam) && startParam <= endParam;
  const cacheKey = `${client.id}:${useCustom ? `${startParam}_${endParam}` : "default"}`;

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data);
  }

  const { period, previous_period } = useCustom
    ? computeCustomPeriod(startParam as string, endParam as string)
    : computeLiveWeekPeriod();

  const report: ReportData = {
    generated_at: new Date().toISOString(),
    client_name: client.name,
    period,
    previous_period,
    meta: { account_id: client.meta_account_id ?? "", account_name: client.meta_account_name ?? client.name, campaigns: [] },
    google: {
      account_id: client.google_customer_id ?? "",
      account_name: client.google_account_name ?? client.name,
      campaigns: [],
    },
  };

  if (client.meta_account_id) {
    try {
      report.meta = await fetchMetaPlatformBlock({
        accountId: client.meta_account_id,
        accountName: client.meta_account_name ?? client.name,
        period,
        previousPeriod: previous_period,
        includeSalesInsights: true,
      });
    } catch (e: any) {
      console.error(`Erro ao buscar Meta Ads (live) [${client.slug}]:`, e);
      report.meta = {
        account_id: client.meta_account_id,
        account_name: client.meta_account_name ?? client.name,
        campaigns: [],
        status: "erro_sincronizacao",
        note: `Falha ao buscar dados do Meta Ads: ${String(e?.message ?? e)}`,
      };
    }
  }

  if (client.google_customer_id) {
    report.google = await fetchGooglePlatformBlock({
      customerId: client.google_customer_id,
      accountName: client.google_account_name ?? client.name,
      mccName: client.google_mcc_name ?? "Elo Criativo",
      period,
      previousPeriod: previous_period,
    });
  }

  if (cache.size > 60) cache.clear();
  cache.set(cacheKey, { data: report, expiresAt: Date.now() + CACHE_MS });

  return NextResponse.json(report);
}
