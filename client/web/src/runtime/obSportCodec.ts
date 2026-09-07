/**
 * OB 体育 gzip+base64 JSON 解码（浏览器）。不进电竞 MQTT / venue-adapter/ob。
 */

function bytesFromBase64(data: string): Uint8Array {
  const bin = atob(data.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++)
    out[i] = bin.charCodeAt(i);
  return out;
}

async function gunzipBytes(bytes: Uint8Array): Promise<string> {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([copy]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buf);
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
      jsonText = await gunzipBytes(bytes);
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
