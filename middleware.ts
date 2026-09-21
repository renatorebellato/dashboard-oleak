import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

// Slug usado quando a URL não tem "/c/<slug>" — mantém a raiz do domínio
// (dashboard-oleak.vercel.app) funcionando exatamente como antes para a
// Oleak, sem quebrar o link/senha que o cliente já usa.
const DEFAULT_SLUG = "oleak";

function parsePagePath(pathname: string): { slug: string; isLogin: boolean } | null {
  if (pathname === "/") return { slug: DEFAULT_SLUG, isLogin: false };
  if (pathname === "/login") return { slug: DEFAULT_SLUG, isLogin: true };
  const m = pathname.match(/^\/c\/([a-z0-9-]+)(\/login)?$/);
  if (m) return { slug: m[1], isLogin: !!m[2] };
  return null; // não é uma rota de página conhecida (deixa passar)
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rotas de API cuidam da própria autenticação (lib/session.ts) e
  // respondem 401 em JSON; não interceptamos aqui para não devolver HTML de
  // login para um fetch() que espera JSON. O cron tem seu próprio segredo
  // (CRON_SECRET), separado deste cookie.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const info = parsePagePath(pathname);
  if (!info) return NextResponse.next();
  if (info.isLogin) return NextResponse.next();

  const secret = process.env.DASH_AUTH_SECRET;
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = secret ? await verifySessionToken(token, secret) : null;

  // Precisa ter sessão válida E ser do cliente certo — impede que o cookie
  // de um cliente "funcione" na URL de outro cliente.
  if (session && session.slug === info.slug) {
    return NextResponse.next();
  }

  const loginPath = info.slug === DEFAULT_SLUG ? "/login" : `/c/${info.slug}/login`;
  return NextResponse.redirect(new URL(loginPath, req.url));
}

export const config = {
  // Roda em tudo, exceto assets estáticos internos do Next.js.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
