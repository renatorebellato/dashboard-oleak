// Autenticação por senha (uma por cliente), via cookie assinado
// (HMAC-SHA256). Usa a Web Crypto API (crypto.subtle) para funcionar tanto
// no middleware (Edge Runtime) quanto nas rotas de API (Node.js runtime)
// sem depender do módulo "crypto" do Node nem de Buffer.

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

function base64UrlEncode(str: string): string {
  const bytes = encoder.encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export type SessionPayload = { exp: number; slug: string };

// Gera um token assinado no formato "<payloadBase64Url>.<assinaturaHex>".
// O payload carrega a expiração e o slug do cliente (não o id), assim o
// middleware consegue conferir "esse cookie é desse cliente mesmo?" sem
// precisar consultar o banco a cada requisição.
export async function signSessionToken(payload: SessionPayload, secret: string): Promise<string> {
  const key = await getHmacKey(secret);
  const payloadStr = base64UrlEncode(JSON.stringify(payload));
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadStr));
  return `${payloadStr}.${bufToHex(sig)}`;
}

// Confere a assinatura e a expiração do token. Retorna null para qualquer
// token ausente, malformado, expirado ou adulterado.
export async function verifySessionToken(
  token: string | undefined,
  secret: string
): Promise<SessionPayload | null> {
  if (!token) return null;
  const dotIndex = token.indexOf(".");
  if (dotIndex < 0) return null;

  const payloadStr = token.slice(0, dotIndex);
  const sigHex = token.slice(dotIndex + 1);

  let payload: SessionPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadStr));
  } catch {
    return null;
  }
  if (!payload || typeof payload.slug !== "string" || !Number.isFinite(payload.exp)) return null;
  if (payload.exp * 1000 < Date.now()) return null;

  try {
    const key = await getHmacKey(secret);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      hexToBytes(sigHex) as BufferSource,
      encoder.encode(payloadStr)
    );
    return ok ? payload : null;
  } catch {
    return null;
  }
}

// --- Hash de senha (PBKDF2-SHA256, 100k iterações) ---
// Formato salvo: "<saltHex>.<hashHex>". Nunca guardamos a senha em texto
// puro em lugar nenhum (nem no banco, nem em env var).
const PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return `${bufToHex(salt.buffer)}.${bufToHex(bits)}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(".");
  if (!saltHex || !hashHex) return false;
  try {
    const salt = hexToBytes(saltHex);
    const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
      "deriveBits",
    ]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      keyMaterial,
      256
    );
    return bufToHex(bits) === hashHex;
  } catch {
    return false;
  }
}

export const SESSION_COOKIE_NAME = "oleak_auth";
export const SESSION_SECONDS = 60 * 60 * 24 * 30; // 30 dias
