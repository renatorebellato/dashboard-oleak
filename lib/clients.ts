import { supabaseAdmin } from "./supabaseAdmin";

export type ClientRecord = {
  id: string;
  slug: string;
  name: string;
  password_hash: string;
  active: boolean;
  meta_account_id: string | null;
  meta_account_name: string | null;
  google_customer_id: string | null;
  google_account_name: string | null;
  google_mcc_name: string | null;
  ga4_property_id: string | null;
  // Quando preenchido (ex: "[Meddi]"), o Google Ads do cliente vira a soma de
  // TODAS as contas da MCC cujo nome contém esse texto — em vez de uma conta
  // só (google_customer_id). Contas novas com o mesmo prefixo entram sozinhas.
  google_account_filter?: string | null;
  // Período que o dashboard abre por padrão: "7d", "14d", "30d", "month" ou
  // "ytd" (ano atual). Vazio = 7 dias.
  default_period?: string | null;
  created_at: string;
};

export async function getClientBySlug(slug: string): Promise<ClientRecord | null> {
  const { data, error } = await supabaseAdmin.from("clients").select("*").eq("slug", slug).maybeSingle();
  if (error) {
    console.error("Erro ao buscar cliente por slug:", error.message);
    return null;
  }
  return (data as ClientRecord) ?? null;
}

export async function getClientById(id: string): Promise<ClientRecord | null> {
  const { data, error } = await supabaseAdmin.from("clients").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("Erro ao buscar cliente por id:", error.message);
    return null;
  }
  return (data as ClientRecord) ?? null;
}

export async function listActiveClients(): Promise<ClientRecord[]> {
  const { data, error } = await supabaseAdmin.from("clients").select("*").eq("active", true);
  if (error) {
    console.error("Erro ao listar clientes ativos:", error.message);
    return [];
  }
  return (data as ClientRecord[]) ?? [];
}
