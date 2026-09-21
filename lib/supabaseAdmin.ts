import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!url || !serviceRoleKey) {
  console.warn(
    "Supabase admin não configurado: verifique NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."
    );
}

// Cliente server-side com a service role key (ignora RLS). NUNCA importar
// este arquivo em componentes "use client" — só dentro de app/api/**/route.ts,
// que roda exclusivamente no servidor da Vercel.
export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});
