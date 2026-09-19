/** Probe how many mids structureMatchBaseInfoByMidsPB actually returns per batch. */
async function tryPlay(lang) {
  const r = await fetch(`https://api.dbsporxxxw1box.com/yewu6/user/tryPlay?lang=${lang}&terminal=PC`);
  const j = await r.json();
  if (!(j.status === true || j.code === "0000000" || j.code === "0"))
    throw new Error(`${lang} tryPlay fail`);
  return j.data.token;
}

function uuid() {
  return (globalThis.crypto?.randomUUID?.() || String(Date.now())).replace(/-/g, "");
}

async function decodePb(envelope) {
  let data = envelope?.data ?? envelope;
  if (typeof data !== "string")
    return data;
  const bin = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  try {
    const ds = new DecompressionStream("gzip");
    const text = await new Response(new Blob([bin]).stream().pipeThrough(ds)).text();
    return JSON.parse(text);
  }
  catch {
    return JSON.parse(new TextDecoder().decode(bin));
  }
}

async function post(token, lang, path, body) {
  const res = await fetch(`https://api.dbsporxxxw1box.com${path}?t=${Date.now()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      lang,
      requestId: token,
      checkId: `pc-${uuid()}-0-${Date.now()}`,
      "request-code": JSON.stringify({ "panda-bss-source": "2" }),
    },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (j.code != null && String(j.code) !== "0" && String(j.code) !== "0000000")
    throw new Error(`${path} code=${j.code} ${j.msg || ""}`);
  return decodePb(j);
}

function collectMids(node, out = new Set(), depth = 0) {
  if (!node || depth > 8)
    return out;
  if (Array.isArray(node)) {
    for (const x of node)
      collectMids(x, out, depth + 1);
    return out;
  }
  if (typeof node !== "object")
    return out;
  const mid = String(node.mid || "").trim();
  if (/^\d{4,12}$/.test(mid))
    out.add(mid);
  const midsRaw = node.mids;
  if (midsRaw) {
    const list = Array.isArray(midsRaw) ? midsRaw.map(String) : String(midsRaw).split(",");
    for (const id of list.map(s => String(s).trim())) {
      if (/^\d{4,12}$/.test(id))
        out.add(id);
    }
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === "object")
      collectMids(v, out, depth + 1);
  }
  return out;
}

function namedFromOdds(node, out = new Map(), depth = 0) {
  if (!node || depth > 8)
    return out;
  if (Array.isArray(node)) {
    for (const x of node)
      namedFromOdds(x, out, depth + 1);
    return out;
  }
  if (typeof node !== "object")
    return out;
  const mid = String(node.mid || "").trim();
  if (/^\d{4,12}$/.test(mid)) {
    const home = String(node.mhn || "").trim();
    const away = String(node.man || "").trim();
    out.set(mid, Boolean(home && away));
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === "object")
      namedFromOdds(v, out, depth + 1);
  }
  return out;
}

const tok = await tryPlay("zh");
const sched = await post(tok, "zh", "/yewu11/v2/w/structureTournamentMatchesPB", {
  cuid: "0",
  sort: 1,
  tid: "",
  apiType: 1,
  orpt: 0,
  euid: "3020101",
});
const allMids = [...collectMids(sched)];
console.log("schedule mids", allMids.length, "(body matches our fetchSchedule)");

for (const size of [4, 8, 12, 16, 24]) {
  const part = allMids.slice(0, size);
  await new Promise(r => setTimeout(r, 500));
  try {
    const odds = await post(tok, "zh", "/yewu11/v1/w/structureMatchBaseInfoByMidsPB", {
      cuid: "0",
      euid: "3020101",
      mids: part.join(","),
    });
    const got = namedFromOdds(odds);
    const named = [...got.values()].filter(Boolean).length;
    const hit = part.filter(m => got.has(m)).length;
    console.log(`batch=${size} returned_mids=${got.size} hit_requested=${hit}/${size} named=${named}`);
  }
  catch (err) {
    console.log(`batch=${size} FAIL`, err instanceof Error ? err.message : err);
  }
}

// full windowed-style: chunk 12 across first 60
console.log("\nchunked 12 over first 60:");
let hit = 0;
let named = 0;
let fail = 0;
const first60 = allMids.slice(0, 60);
for (let i = 0; i < first60.length; i += 12) {
  const part = first60.slice(i, i + 12);
  await new Promise(r => setTimeout(r, 400));
  try {
    const odds = await post(tok, "zh", "/yewu11/v1/w/structureMatchBaseInfoByMidsPB", {
      cuid: "0",
      euid: "3020101",
      mids: part.join(","),
    });
    const got = namedFromOdds(odds);
    hit += part.filter(m => got.has(m)).length;
    named += [...got.values()].filter(Boolean).length;
    console.log(`  part ${i / 12 + 1}: ${got.size}/${part.length} named=${[...got.values()].filter(Boolean).length}`);
  }
  catch (err) {
    fail += part.length;
    console.log(`  part ${i / 12 + 1}: FAIL`, err instanceof Error ? err.message : err);
  }
}
console.log(`summary hit=${hit}/60 named=${named} failed_slots=${fail}`);
