/**
 * 本机 PM 私钥仓：PBKDF2 + AES-GCM（Web Crypto）
 */

export const PM_VAULT_VERSION = 1;
export const PM_VAULT_KDF_ITERATIONS = 310_000;
const VERIFIER_PLAINTEXT = "changmen-pm-vault-v1";

function requireSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle)
    throw new Error("当前环境不支持 Web Crypto，无法使用本机钱包");
  return subtle;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export async function deriveKek(
  password: string,
  salt: Uint8Array,
  iterations = PM_VAULT_KDF_ITERATIONS,
): Promise<CryptoKey> {
  const subtle = requireSubtle();
  const material = await subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface AesGcmBlob {
  ivB64: string;
  ctB64: string;
}

export async function encryptUtf8(kek: CryptoKey, plaintext: string): Promise<AesGcmBlob> {
  const subtle = requireSubtle();
  const iv = randomBytes(12);
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    kek,
    new TextEncoder().encode(plaintext),
  );
  return { ivB64: bytesToBase64(iv), ctB64: bytesToBase64(new Uint8Array(ct)) };
}

export async function decryptUtf8(kek: CryptoKey, blob: AesGcmBlob): Promise<string> {
  const subtle = requireSubtle();
  const iv = base64ToBytes(blob.ivB64);
  const ct = base64ToBytes(blob.ctB64);
  const pt = await subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    kek,
    ct as BufferSource,
  );
  return new TextDecoder().decode(pt);
}

export async function createVerifier(kek: CryptoKey): Promise<AesGcmBlob> {
  return encryptUtf8(kek, VERIFIER_PLAINTEXT);
}

export async function verifyKek(kek: CryptoKey, verifier: AesGcmBlob): Promise<boolean> {
  try {
    const pt = await decryptUtf8(kek, verifier);
    return pt === VERIFIER_PLAINTEXT;
  }
  catch {
    return false;
  }
}
