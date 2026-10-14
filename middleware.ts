import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

// Cada cliente tem o próprio caminho: elocriativo.vercel.app/<slug> (ex:
// /oleak, /grupo-meddi) e /<slug>/login. Os caminhos antigos (/c/<slug>,
// /login, domínio dashboard-oleak) são redirecionados em next.config.js
// antes de chegar aqui. A raiz (/) é uma página neutra, sem login.
const RESERVED = new Set(["api", "c", "login", "_next"]);

function parsePagePath(pathname: string): { slug: string; isLogin: boolean } | null {
  const m = pathname.match(/^\/([a-z0-9-]+)(\/login)?\/?$/);
  if (m && !RESERVED.has(m[1])) return { slug: m[1], isLogin: !!m[2] };
  return null; // não é uma página de cliente (deixa passar)
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

  return NextResponse.redirect(new URL(`/${info.slug}/login`, req.url));
}

export const config = {
  // Roda em tudo, exceto assets estáticos internos do Next.js.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
