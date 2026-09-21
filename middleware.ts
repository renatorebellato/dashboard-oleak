import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

// Protege o dashboard inteiro com uma senha única (compartilhada com o
// cliente). Ficam de fora: a própria página de login, a rota que valida a
// senha, a rota do cron da Vercel (que já tem seu próprio segredo,
// CRON_SECRET, e não tem como enviar o cookie de sessão) e os arquivos
// internos do Next.js.
const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  const secret = process.env.DASH_AUTH_SECRET;
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (secret && (await verifySessionToken(token, secret))) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Roda em tudo, exceto assets estáticos internos do Next.js.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
