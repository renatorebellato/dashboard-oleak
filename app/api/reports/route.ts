import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ReportData } from "@/lib/types";

// Substitui o acesso direto do navegador ao Supabase (chave anon) que
// existia quando só havia um cliente: agora que weekly_reports guarda dados
// de vários clientes, ler/escrever precisa passar por aqui, que resolve o
// cliente pelo cookie de sessão (nunca por algo vindo do navegador) e usa a
// service role key só no servidor.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const client = await requireClient(req);
  if (!client) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("weekly_reports")
    .select("*")
    .eq("client_id", client.id)
    .order("period_start", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reports: data ?? [] });
}

export async function POST(req: NextRequest) {
  const client = await requireClient(req);
  if (!client) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as ReportData | null;
  if (!body?.period?.start || !body?.period?.end || !body?.previous_period?.start) {
    return NextResponse.json(
      { error: "JSON não tem o formato esperado (faltam period / previous_period)." },
      { status: 400 }
    );
  }
  body.client_name = body.client_name ?? client.name;

  const { error } = await supabaseAdmin.from("weekly_reports").upsert(
    {
      client_id: client.id,
      period_start: body.period.start,
      period_end: body.period.end,
      prev_period_start: body.previous_period.start,
      prev_period_end: body.previous_period.end,
      data: body,
      generated_at: body.generated_at ?? new Date().toISOString(),
    },
    { onConflict: "client_id,period_start,period_end" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
