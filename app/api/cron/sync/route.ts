import { NextRequest, NextResponse } from "next/server";
import { computeWeekPeriod } from "@/lib/period";
import { fetchMetaPlatformBlock } from "@/lib/metaSync";
import { fetchGooglePlatformBlock } from "@/lib/googleSync";
import { getOrInitReport, saveReport } from "@/lib/reportStore";
import { listActiveClients } from "@/lib/clients";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;
  const querySecret = req.nextUrl.searchParams.get("secret");
  if (querySecret === secret) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { period, previous_period } = computeWeekPeriod();
  const clients = await listActiveClients();

  // Roda os clientes em paralelo — cada um é independente, e assim o tempo
  // total não cresce linearmente com o número de clientes.
  const results = await Promise.all(
    clients.map(async (client) => {
      const entry: Record<string, unknown> = { slug: client.slug };

      const report = await getOrInitReport({
        clientId: client.id,
        clientName: client.name,
        period,
        previousPeriod: previous_period,
        metaAccountId: client.meta_account_id ?? "",
        metaAccountName: client.meta_account_name ?? client.name,
        googleAccountId: client.google_customer_id ?? "",
        googleAccountName: client.google_account_name ?? client.name,
      });
      report.client_name = client.name;

      if (client.meta_account_id) {
        try {
          report.meta = await fetchMetaPlatformBlock({
            accountId: client.meta_account_id,
            accountName: client.meta_account_name ?? client.name,
            period,
            previousPeriod: previous_period,
          });
          entry.meta = { ok: true, campanhas: report.meta.campaigns.length };
        } catch (e: any) {
          console.error(`Erro ao sincronizar Meta Ads [${client.slug}]:`, e);
          entry.meta = { ok: false, error: String(e?.message ?? e) };
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
        entry.google = {
          ok: report.google.status !== "erro_sincronizacao",
          campanhas: report.google.campaigns.length,
          status: report.google.status,
        };
      }

      try {
        await saveReport(report, client.id);
        entry.saved = true;
      } catch (e: any) {
        console.error(`Erro ao salvar relatório [${client.slug}]:`, e);
        entry.saved = false;
        entry.save_error = String(e?.message ?? e);
      }

      return entry;
    })
  );

  return NextResponse.json({ period, previous_period, clients: results });
}
