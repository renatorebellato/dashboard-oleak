import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, SESSION_SECONDS, signSessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const expected = process.env.DASH_PASSWORD;
  const secret = process.env.DASH_AUTH_SECRET;

  if (!expected || !secret) {
    return NextResponse.json(
      { error: "Login não configurado no servidor (faltam variáveis de ambiente)." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";

  if (password !== expected) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const token = await signSessionToken(expiresAt, secret);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return res;
}
