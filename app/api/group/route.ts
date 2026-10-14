import { NextRequest, NextResponse } from "next/server";
import { computeCustomPeriod, computeLiveWeekPeriod } from "@/lib/period";
import { requireClient } from "@/lib/session";
import { fetchGroupDashboard } from "@/lib/googleGroup";
import type { GroupDashboardData } from "@/lib/groupTypes";

// Dados do dashboard de grupo (clientes com google_account_filter, ex: Grupo
// Meddi). Uma chamada por período: o navegador filtra por conta/campanha
// localmente. O cliente vem do cookie de sessão, nunca de um parâmetro.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const cache = new Map<string, { data: GroupDashboardData; expiresAt: number }>();
const CACHE_MS = 5 * 60_000;

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET(req: NextRequest) {
  const client = await requireClient(req);
  if (!client) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!client.google_account_filter?.trim()) {
    return NextResponse.json({ error: "Este cliente não usa o dashboard de grupo." }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const custom = isDate(start) && isDate(end) && start <= end;
  const { period, previous_period } = custom ? computeCustomPeriod(start, end) : computeLiveWeekPeriod();

  const fresh = searchParams.get("fresh") === "1";
  const key = `${client.id}:${period.start}_${period.end}`;
  const hit = cache.get(key);
  if (!fresh && hit && hit.expiresAt > Date.now()) return NextResponse.json(hit.data);

  try {
    const result = await fetchGroupDashboard({
      nameFilter: client.google_account_filter,
      period,
      previousPeriod: previous_period,
    });
    const failed = result.accounts.filter((a) => a.status === "erro_sincronizacao");
    const data: GroupDashboardData = {
      generated_at: new Date().toISOString(),
      client_name: client.name,
      period,
      previous_period,
      ...result,
      note:
        result.accounts.length === 0
          ? `Nenhuma conta ativa na MCC com "${client.google_account_filter}" no nome.`
          : failed.length > 0
          ? `Não foi possível buscar ${failed.length} conta(s): ${failed.map((f) => f.name).join(", ")}.`
          : undefined,
    };
    if (cache.size > 40) cache.clear();
    cache.set(key, { data, expiresAt: Date.now() + CACHE_MS });
    return NextResponse.json(data);
  } catch (e: any) {
    console.error(`Erro no dashboard de grupo [${client.slug}]:`, e);
    return NextResponse.json({ error: `Falha ao buscar dados do Google Ads: ${String(e?.message ?? e)}` }, { status: 502 });
  }
}
