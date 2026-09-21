import { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./auth";
import { getClientBySlug, type ClientRecord } from "./clients";

// Usado pelas rotas de API que servem dado (/api/live, /api/reports): lê o
// cookie de sessão, confere a assinatura e devolve o registro do cliente
// dono dessa sessão — ou null se não houver sessão válida. As rotas
// respondem 401 nesse caso, sem depender do middleware (que só cuida do
// redirecionamento das páginas).
export async function requireClient(req: NextRequest): Promise<ClientRecord | null> {
  const secret = process.env.DASH_AUTH_SECRET;
  if (!secret) return null;
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token, secret);
  if (!session) return null;
  const client = await getClientBySlug(session.slug);
  if (!client || !client.active) return null;
  return client;
}
