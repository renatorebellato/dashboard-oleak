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
