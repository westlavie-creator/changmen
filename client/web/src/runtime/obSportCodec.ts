/**
 * OB 体育 gzip+base64 JSON 解码（浏览器）。不进电竞 MQTT / venue-adapter/ob。
 */

function bytesFromBase64(data: string): Uint8Array {
  const compact = String(data || "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = compact + "=".repeat((4 - (compact.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++)
    out[i] = bin.charCodeAt(i);
  return out;
}

async function decompressBytes(bytes: Uint8Array, format: CompressionFormat): Promise<string> {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const ds = new DecompressionStream(format);
  const stream = new Blob([copy]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buf);
}

async function inflateBytes(bytes: Uint8Array): Promise<string> {
  const attempts: Array<() => Promise<string>> = [];
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b)
    attempts.push(() => decompressBytes(bytes, "gzip"));
  attempts.push(
    () => decompressBytes(bytes, "deflate"),
    () => decompressBytes(bytes, "deflate-raw"),
  );
  if (bytes.length > 6 && bytes[0] === 0x78)
    attempts.push(() => decompressBytes(bytes.subarray(2, bytes.length - 4), "deflate-raw"));
  if (!(bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b))
    attempts.push(() => decompressBytes(bytes, "gzip"));
  let last: unknown;
  for (const run of attempts) {
    try {
      return await run();
    }
    catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("inflate failed");
}

function parseInflatedText(text: string): unknown {
  const raw = String(text || "").trim();
  if (!raw)
    return null;
  try {
    return JSON.parse(raw);
  }
  catch { /* uri-encoded JSON from official inflate */ }
  try {
    return JSON.parse(decodeURIComponent(raw));
  }
  catch {
    return null;
  }
}

/**
 * 官网 C105：cd 常为 base64 + zlib inflate，再 JSON。
 * 已是对象则原样返回。
 */
export async function unzipObSportPushCd(cd: unknown): Promise<unknown> {
  if (cd == null || typeof cd === "object")
    return cd;
  if (typeof cd !== "string" || !cd.trim())
    return cd;
  try {
    return JSON.parse(cd);
  }
  catch { /* compressed */ }
  let bytes: Uint8Array;
  try {
    bytes = bytesFromBase64(cd);
  }
  catch {
    return cd;
  }
  if (!bytes.length)
    return cd;
  try {
    const parsed = parseInflatedText(await inflateBytes(bytes));
    if (parsed != null)
      return parsed;
  }
  catch { /* keep original */ }
  return cd;
}

export async function decodeObSportPbPayload(envelope: unknown): Promise<unknown> {
  if (envelope == null)
    return null;
  if (typeof envelope === "object" && envelope !== null && !("data" in envelope))
    return envelope;
  const data = (envelope as { data?: unknown }).data;
  if (data && typeof data === "object")
    return data;
  if (typeof data !== "string" || !data.trim())
    return envelope;
  const bytes = bytesFromBase64(data);
  let jsonText = "";
  try {
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b)
      jsonText = await decompressBytes(bytes, "gzip");
    else
      jsonText = new TextDecoder().decode(bytes);
  }
  catch {
    return null;
  }
  try {
    return JSON.parse(jsonText);
  }
  catch {
    return null;
  }
}
