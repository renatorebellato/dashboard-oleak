import { NextRequest, NextResponse } from "next/server";
import { computeWeekPeriod } from "@/lib/period";
import { fetchMetaPlatformBlock } from "@/lib/metaSync";
import { fetchGooglePlatformBlock } from "@/lib/googleSync";
import { getOrInitReport, saveReport } from "@/lib/reportStore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const META_ACCOUNT_ID = "271327700853914";
const META_ACCOUNT_NAME = "OLEAK INDUSTRIA E COMERCIO LTDA";
const GOOGLE_CUSTOMER_ID = "3707738500";
const GOOGLE_ACCOUNT_NAME = "Oleak - Ativa";
const GOOGLE_MCC_NAME = "Elo Criativo";

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
  const summary: Record<string, unknown> = { period, previous_period };

const report = await getOrInitReport({
  period,
  previousPeriod: previous_period,
  metaAccountId: META_ACCOUNT_ID,
  metaAccountName: META_ACCOUNT_NAME,
  googleAccountId: GOOGLE_CUSTOMER_ID,
  googleAccountName: GOOGLE_ACCOUNT_NAME,
});

// Meta Ads
try {
  report.meta = await fetchMetaPlatformBlock({
    accountId: META_ACCOUNT_ID,
    accountName: META_ACCOUNT_NAME,
    period,
    previousPeriod: previous_period,
  });
  summary.meta = { ok: true, campanhas: report.meta.campaigns.length };
} catch (e: any) {
  console.error("Erro ao sincronizar Meta Ads:", e);
  summary.meta = { ok: false, error: String(e?.message ?? e) };
}

// Google Ads (a própria função já trata erro internamente e nunca lança)
report.google = await fetchGooglePlatformBlock({
  customerId: GOOGLE_CUSTOMER_ID,
  accountName: GOOGLE_ACCOUNT_NAME,
  mccName: GOOGLE_MCC_NAME,
  period,
  previousPeriod: previous_period,
});
  summary.google = {
    ok: report.google.status !== "erro_sincronizacao",
    campanhas: report.google.campaigns.length,
    status: report.google.status,
  };

try {
  await saveReport(report);
  summary.saved = true;
} catch (e: any) {
  console.error("Erro ao salvar relatório:", e);
  summary.saved = false;
  summary.save_error = String(e?.message ?? e);
}

return NextResponse.json(summary);
}
