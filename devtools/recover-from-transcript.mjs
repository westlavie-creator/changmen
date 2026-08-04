#!/usr/bin/env node
/**
 * Replay Write/StrReplace tool_use events from an agent transcript onto disk.
 * Usage: node recover-from-transcript.mjs <transcript.jsonl> [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";

const transcript = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!transcript) {
  console.error("usage: node recover-from-transcript.mjs <transcript.jsonl> [--dry-run]");
  process.exit(1);
}

const events = [];
for (const line of fs.readFileSync(transcript, "utf8").split(/\n/)) {
  if (!line.trim()) continue;
  let o;
  try {
    o = JSON.parse(line);
  } catch {
    continue;
  }
  for (const c of o?.message?.content || []) {
    if (c?.type !== "tool_use") continue;
    const inp = c.input || {};
    if (!inp.path) continue;
    if (c.name === "Write" && inp.contents != null)
      events.push({ op: "Write", path: inp.path, contents: inp.contents });
    else if (c.name === "StrReplace" && inp.old_string != null)
      events.push({
        op: "StrReplace",
        path: inp.path,
        old: inp.old_string,
        neu: inp.new_string,
        replaceAll: !!inp.replace_all,
      });
  }
}

function norm(s) {
  return String(s).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function applyNormReplace(text, oldS, newS, replaceAll) {
  const nText = norm(text);
  const nOld = norm(oldS);
  const nNew = norm(newS);
  if (replaceAll) {
    if (!nText.includes(nOld)) return { ok: false, err: "miss" };
    return { ok: true, text: nText.split(nOld).join(nNew) };
  }
  const i = nText.indexOf(nOld);
  if (i < 0) return { ok: false, err: `miss ${JSON.stringify(nOld.slice(0, 100))}` };
  const j = nText.indexOf(nOld, i + 1);
  if (j >= 0) return { ok: false, err: "not unique" };
  return { ok: true, text: nText.slice(0, i) + nNew + nText.slice(i + nOld.length) };
}

const byPath = {};
for (const e of events) (byPath[e.path] ||= []).push(e);

const results = [];
for (const [filePath, evs] of Object.entries(byPath)) {
  let text = null;
  if (evs[0].op !== "Write") {
    if (!fs.existsSync(filePath)) {
      results.push({ filePath, ok: false, err: "no base file" });
      continue;
    }
    text = fs.readFileSync(filePath, "utf8");
  }
  let ok = true;
  let err = "";
  for (const e of evs) {
    if (e.op === "Write") {
      text = e.contents;
      continue;
    }
    const r = applyNormReplace(text, e.old, e.neu, e.replaceAll);
    if (!r.ok) {
      ok = false;
      err = r.err;
      break;
    }
    text = r.text;
  }
  if (!ok) {
    results.push({ filePath, ok, err });
    continue;
  }
  const out = norm(text);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, out, "utf8");
  }
  results.push({ filePath, ok: true, bytes: out.length, ops: evs.length });
}

for (const r of results) {
  const short = r.filePath.replace(/\\/g, "/").split("/").slice(-3).join("/");
  console.log(r.ok ? "OK  " : "FAIL", short, r.ok ? `${r.bytes}b ops=${r.ops}` : r.err);
}
const fail = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fail}/${results.length} ok`);
process.exit(fail ? 1 : 0);
