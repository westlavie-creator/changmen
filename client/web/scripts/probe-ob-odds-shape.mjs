/** Inspect odds row fields when mhn/man missing. */
async function tryPlay(lang) {
  const r = await fetch(`https://api.dbsporxxxw1box.com/yewu6/user/tryPlay?lang=${lang}&terminal=PC`);
  const j = await r.json();
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
  for (let i = 0; i < 4; i++) {
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
    if (String(j.code) === "0401038") {
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      continue;
    }
    if (j.code != null && String(j.code) !== "0" && String(j.code) !== "0000000")
      throw new Error(`${path} code=${j.code} ${j.msg || ""}`);
    return decodePb(j);
  }
  throw new Error("rate limited");
}
function collectMids(node, out = [], depth = 0) {
  if (!node || depth > 8)
    return out;
  if (Array.isArray(node)) {
    for (const x of node)
      collectMids(x, out, depth + 1);
    return out;
  }
  if (typeof node !== "object")
    return out;
  if (node.mids) {
    const list = Array.isArray(node.mids) ? node.mids : String(node.mids).split(",");
    for (const id of list.map(String)) {
      const mid = id.trim();
      if (/^\d{4,12}$/.test(mid) && !out.includes(mid))
        out.push(mid);
    }
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === "object")
      collectMids(v, out, depth + 1);
  }
  return out;
}
function findMatchRows(node, out = [], depth = 0) {
  if (!node || depth > 8)
    return out;
  if (Array.isArray(node)) {
    for (const x of node)
      findMatchRows(x, out, depth + 1);
    return out;
  }
  if (typeof node !== "object")
    return out;
  const mid = String(node.mid || "").trim();
  if (/^\d{4,12}$/.test(mid))
    out.push(node);
  for (const v of Object.values(node)) {
    if (v && typeof v === "object")
      findMatchRows(v, out, depth + 1);
  }
  return out;
}

await new Promise(r => setTimeout(r, 3000));
const tok = await tryPlay("zh");
const sched = await post(tok, "zh", "/yewu11/v2/w/structureTournamentMatchesPB", {
  cuid: "0", sort: 1, tid: "", apiType: 1, orpt: 0, euid: "3020101",
});
const mids = collectMids(sched).slice(0, 4);
console.log("request mids", mids);
await new Promise(r => setTimeout(r, 1500));
const odds = await post(tok, "zh", "/yewu11/v1/w/structureMatchBaseInfoByMidsPB", {
  cuid: "0", euid: "3020101", mids: mids.join(","),
});
const rows = findMatchRows(odds);
console.log("returned rows", rows.length);
for (const row of rows.slice(0, 4)) {
  const keys = Object.keys(row);
  const nameish = Object.fromEntries(
    keys.filter(k => /hn|an|home|away|name|team|tn|mid/i.test(k))
      .map(k => [k, row[k]]),
  );
  console.log({
    mid: row.mid,
    mhn: row.mhn,
    man: row.man,
    nameish,
    allKeys: keys.slice(0, 50),
    hasPlayData: Array.isArray(row.playData) || Array.isArray(row.hps),
  });
}
