/** 对齐 backend/platforms/tf/tf_auth.js + A8 bundle MBe/N3 */

const PUBLIC_TOKEN = "2633b50ad4f64cd28b3224e47c877057";

function stripTokenPrefix(token: string): string {
  return token.replace(/^Token\s+/i, "");
}

function decodeTokenKey(token: string): ArrayBuffer {
  const raw = stripTokenPrefix(token);
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function hmacSha1(key: ArrayBuffer, data: ArrayBuffer): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, data);
}

async function sha512Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-512", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function buildTfAuthorization(token: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = decodeTokenKey(token);
  const s = Math.floor(nowSec / 10);
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(4, s >>> 0, false);

  const hmac = new Uint8Array(await hmacSha1(key, buf));
  const c = hmac[hmac.length - 1]! & 0x0f;
  const d =
    ((hmac[c]! & 0x7f) << 24) | (hmac[c + 1]! << 16) | (hmac[c + 2]! << 8) | hmac[c + 3]!;
  const padded = String(d % 1e6).padStart(6, "0");
  return sha512Hex(padded);
}

export function normalizeTfAuthorization(token: string): string {
  if (!token) return "";
  return /^Token\s+/i.test(token) ? token : `Token ${token}`;
}

export async function tfRequestHeaders(token: string, extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const auth = normalizeTfAuthorization(token);
  return {
    Accept: "application/json, text/plain, */*",
    Authorization: auth,
    "tf-authorization": await buildTfAuthorization(auth),
    "public-token": PUBLIC_TOKEN,
    ...extra,
  };
}

export function tfWsAuthToken(token: string): string {
  return stripTokenPrefix(token);
}
