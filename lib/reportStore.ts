import { supabaseAdmin } from "./supabaseAdmin";
import type { PlatformBlock, ReportData } from "./types";

const EMPTY_PLATFORM = (accountId: string, accountName: string): PlatformBlock => ({
  account_id: accountId,
  account_name: accountName,
  campaigns: [],
});

// Busca (ou inicializa) o relatório da semana de um cliente, para permitir
// que a rota do Meta e a rota do Google escrevam no mesmo registro sem se
// sobrescreverem.
export async function getOrInitReport(params: {
  clientId: string;
  clientName: string;
  period: { start: string; end: string };
  previousPeriod: { start: string; end: string };
  metaAccountId: string;
  metaAccountName: string;
  googleAccountId: string;
  googleAccountName: string;
}): Promise<ReportData> {
  const { clientId, clientName, period, previousPeriod, metaAccountId, metaAccountName, googleAccountId, googleAccountName } =
    params;

  const { data, error } = await supabaseAdmin
    .from("weekly_reports")
    .select("data")
    .eq("client_id", clientId)
    .eq("period_start", period.start)
    .eq("period_end", period.end)
    .maybeSingle();

  if (error) {
    console.warn("Falha ao buscar relatório existente, iniciando um novo:", error.message);
  }

  if (data?.data) {
    return data.data as ReportData;
  }

  return {
    generated_at: new Date().toISOString(),
    client_name: clientName,
    period,
    previous_period: previousPeriod,
    meta: EMPTY_PLATFORM(metaAccountId, metaAccountName),
    google: EMPTY_PLATFORM(googleAccountId, googleAccountName),
  };
}

export async function saveReport(report: ReportData, clientId: string): Promise<void> {
  report.generated_at = new Date().toISOString();
  const { error } = await supabaseAdmin.from("weekly_reports").upsert(
    {
      client_id: clientId,
      period_start: report.period.start,
      period_end: report.period.end,
      prev_period_start: report.previous_period.start,
      prev_period_end: report.previous_period.end,
      data: report,
      generated_at: report.generated_at,
    },
    { onConflict: "client_id,period_start,period_end" }
  );
  if (error) {
    throw new Error(`Falha ao salvar relatório: ${error.message}`);
  }
}
