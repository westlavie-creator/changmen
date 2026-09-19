/** One-off probe: OB zh vs en schedule/odds team-name coverage. */
async function tryPlay(lang) {
  const r = await fetch(`https://api.dbsporxxxw1box.com/yewu6/user/tryPlay?lang=${lang}&terminal=PC`);
  const j = await r.json();
  if (!(j.status === true || j.code === "0000000" || j.code === "0"))
    throw new Error(`${lang} tryPlay ${JSON.stringify(j).slice(0, 160)}`);
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
    const stream = new Blob([bin]).stream().pipeThrough(ds);
    const text = await new Response(stream).text();
    return JSON.parse(text);
  }
  catch {
    return JSON.parse(new TextDecoder().decode(bin));
  }
}

async function post(token, lang, path, body) {
  const origin = "https://api.dbsporxxxw1box.com";
  const res = await fetch(`${origin}${path}?t=${Date.now()}`, {
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

function walkMids(node, out = new Map(), depth = 0) {
  if (!node || depth > 8)
    return out;
  if (Array.isArray(node)) {
    for (const x of node)
      walkMids(x, out, depth + 1);
    return out;
  }
  if (typeof node !== "object")
    return out;
  const mid = String(node.mid || "").trim();
  if (/^\d{4,12}$/.test(mid)) {
    const home = String(node.mhn || node.home || node.homeName || "").trim();
    const away = String(node.man || node.away || node.awayName || "").trim();
    const prev = out.get(mid) || { home: "", away: "", keys: new Set(), sample: null };
    if (home)
      prev.home = home;
    if (away)
      prev.away = away;
    for (const k of Object.keys(node)) {
      if (/hn|an|home|away|name|team|mhn|man/i.test(k))
        prev.keys.add(k);
    }
    if (!prev.sample)
      prev.sample = Object.keys(node).slice(0, 40);
    out.set(mid, prev);
  }
  const midsRaw = node.mids;
  if (midsRaw) {
    const list = Array.isArray(midsRaw)
      ? midsRaw.map(String)
      : String(midsRaw).split(",").map(s => s.trim());
    for (const id of list) {
      if (/^\d{4,12}$/.test(id) && !out.has(id))
        out.set(id, { home: "", away: "", keys: new Set(["mids-bag"]), sample: null });
    }
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === "object")
      walkMids(v, out, depth + 1);
  }
  return out;
}

function summarize(label, map) {
  const all = [...map.entries()];
  const named = all.filter(([, v]) => v.home && v.away);
  const unnamed = all.filter(([, v]) => !(v.home && v.away));
  console.log(`${label}: total=${all.length} named=${named.length} unnamed=${unnamed.length}`);
  if (unnamed.length) {
    console.log("  sample unnamed", unnamed.slice(0, 5).map(([m, v]) => ({
      mid: m,
      keys: [...v.keys],
      fields: v.sample,
    })));
  }
  if (named.length) {
    console.log("  sample named", named.slice(0, 3).map(([m, v]) => ({
      mid: m,
      home: v.home,
      away: v.away,
    })));
  }
  return { all, named, unnamed };
}

const zhTok = await tryPlay("zh");
const enTok = await tryPlay("en");
console.log("tokens ok", zhTok.slice(0, 8), enTok.slice(0, 8));

for (const [lang, tok] of [["zh", zhTok], ["en", enTok]]) {
  console.log(`\n==== lang=${lang} ====`);
  const sched = await post(tok, lang, "/yewu11/v2/w/structureTournamentMatchesPB", {
    cuid: "0",
    sort: 1,
    euid: "3020101",
    type: 3,
    device: "v2_h5",
    csid: 1,
  });
  const s = summarize("schedule", walkMids(sched));
  const mids = s.all.map(([m]) => m).slice(0, 36);
  const odds = await post(tok, lang, "/yewu11/v1/w/structureMatchBaseInfoByMidsPB", {
    cuid: "0",
    euid: "3020101",
    mids: mids.join(","),
  });
  const o = summarize(`odds batch ${mids.length}`, walkMids(odds));
  let filled = 0;
  let still = 0;
  const stillSamples = [];
  for (const [mid] of s.unnamed) {
    if (!mids.includes(mid))
      continue;
    const ov = o.all.find(([m]) => m === mid)?.[1];
    if (ov?.home && ov?.away)
      filled += 1;
    else {
      still += 1;
      if (stillSamples.length < 5)
        stillSamples.push({ mid, oddsKeys: ov ? [...ov.keys] : null, fields: ov?.sample || null });
    }
  }
  console.log(`among first36: schedule-unnamed filled by odds=${filled} still=${still}`);
  if (stillSamples.length)
    console.log("  still missing", stillSamples);

  // If still missing, try detail for first 3
  for (const row of stillSamples.slice(0, 3)) {
    try {
      const detail = await post(tok, lang, "/yewu11/v1/w/getMatchBaseInfoByOddsPB", {
        cuid: "0",
        cos: 0,
        orpt: 0,
        euid: "3020101",
        mid: row.mid,
        mcid: 0,
        newUser: 0,
      });
      const d = walkMids(detail).get(row.mid);
      console.log("  detail", row.mid, d ? { home: d.home, away: d.away, keys: [...d.keys] } : "no mid");
    }
    catch (err) {
      console.log("  detail fail", row.mid, err instanceof Error ? err.message : String(err));
    }
  }
}
