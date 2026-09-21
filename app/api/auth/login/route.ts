import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, SESSION_SECONDS, signSessionToken, verifyPassword } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.DASH_AUTH_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Login não configurado no servidor (falta DASH_AUTH_SECRET)." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const slug = typeof body?.slug === "string" && body.slug ? body.slug : "oleak";
  const password = typeof body?.password === "string" ? body.password : "";

  const client = await getClientBySlug(slug);
  if (!client || !client.active) {
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  }

  const ok = await verifyPassword(password, client.password_hash);
  if (!ok) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const token = await signSessionToken({ exp: expiresAt, slug }, secret);

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
