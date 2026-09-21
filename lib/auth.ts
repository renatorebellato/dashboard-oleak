// Autenticação simples por senha única (compartilhada com o cliente),
// via cookie assinado (HMAC-SHA256). Usa a Web Crypto API (crypto.subtle)
// para funcionar tanto no middleware (Edge Runtime) quanto nas rotas de
// API (Node.js runtime) sem depender do módulo "crypto" do Node.

const encoder = new TextEncoder();

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// Gera um token assinado no formato "<expiraEmSegundosUnix>.<assinaturaHex>".
export async function signSessionToken(expiresAtSeconds: number, secret: string): Promise<string> {
  const key = await getKey(secret);
  const payload = String(expiresAtSeconds);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${bufToHex(sig)}`;
}

// Confere a assinatura e a expiração do token. Retorna false para
// qualquer token ausente, malformado, expirado ou adulterado.
export async function verifySessionToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const dotIndex = token.indexOf(".");
  if (dotIndex < 0) return false;

  const payload = token.slice(0, dotIndex);
  const sigHex = token.slice(dotIndex + 1);
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return false;

  try {
    const key = await getKey(secret);
    return await crypto.subtle.verify("HMAC", key, hexToBytes(sigHex) as BufferSource, encoder.encode(payload));
  } catch {
    return false;
  }
}

export const SESSION_COOKIE_NAME = "oleak_auth";
export const SESSION_SECONDS = 60 * 60 * 24 * 30; // 30 dias
