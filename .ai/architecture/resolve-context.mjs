// Minimal read-only Context Resolver — consumes ONLY .ai/architecture/index.json.
// Not RAG: no embeddings / LLM / DB / network. Deterministic token matching over the
// index + explicit relation expansion. Never guesses: no token hits → status "unknown".
// Phase 4: camelCase/kebab/snake query normalization (G-1), capability→ownsOperations
// expansion (G-2), superseded-fact quarantine (TE-1), and a safety layer that keeps
// uncertainty alive: CONFLICTED/STALE/UNKNOWN facts are never packaged as certainty.
//
// Usage: node .ai/architecture/resolve-context.mjs "modify pm-sports match writing"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Verbs/meta-words common in task descriptions; they carry no architectural signal.
const STOPWORDS = new Set([
  "modify", "change", "update", "write", "writing", "add", "new", "remove", "delete",
  "refactor", "implement", "fix", "task", "some", "completely", "the", "a", "an", "to",
  "of", "for", "in", "on", "my", "our", "this", "that", "please", "help", "want", "need",
  "capability", "capabilities", "module", "modules", "architecture", "truth", "context",
  "unknown", "into", "from", "with", "and", "or", "is", "are", "be", "only", "all",
]);

// G-1: one shared normalization for query text and index text so that
// matchMerge / match-merge / match_merge land in the same token space.
function normalizeForTokens(text) {
  return String(text)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")   // camelCase → words
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // HTTPServer → HTTP Server
    .replace(/[_\-./:@]+/g, " ");
}
function tokenize(text) {
  return (normalizeForTokens(text).toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}
function tokensOfValue(v, acc = []) {
  if (v == null) return acc;
  if (typeof v === "string") {
    for (const t of tokenize(v)) acc.push(t);
  } else if (Array.isArray(v)) {
    for (const item of v) tokensOfValue(item, acc);
  } else if (typeof v === "object") {
    for (const k of Object.keys(v)) {
      for (const t of tokenize(k)) acc.push(t);
      tokensOfValue(v[k], acc);
    }
  }
  return acc;
}
function keyTokens(key) {
  return tokenize(key);
}

const SECTIONS = ["capabilities", "modules", "resources", "runtimes", "contracts", "rules", "sources", "lines", "conflicts"];

function buildDocs(index) {
  const docs = [];
  for (const section of SECTIONS) {
    const bucket = index[section];
    if (!bucket) continue;
    for (const [key, entry] of Object.entries(bucket)) {
      docs.push({ section, key, entry, ktsSet: new Set(keyTokens(key)), valSet: new Set(tokensOfValue(entry)) });
    }
  }
  return docs;
}

export function resolveContext(query, index) {
  const qTokens = [...new Set(tokenize(query))];
  const docs = buildDocs(index);
  const matched = new Map(); // "section:key" -> {doc, score, viaKey[], viaValue[]}

  for (const doc of docs) {
    let score = 0;
    const viaKey = [];
    const viaValue = [];
    for (const t of qTokens) {
      if (doc.ktsSet.has(t)) { score += 5; viaKey.push(t); }
      else if (doc.valSet.has(t)) { score += 1; viaValue.push(t); }
    }
    // conflicts section: match only on id + topic + layer text (evidence paths excluded)
    if (doc.section === "conflicts") score = viaKey.length * 5 + viaValue.filter((t) => !["server", "docs", "js", "md", "json", "ts"].includes(t)).length;
    if (score >= 4 || (score >= 3 && viaValue.length >= 3)) {
      matched.set(`${doc.section}:${doc.key}`, { doc, score, viaKey, viaValue });
    }
  }

  const relations = [];
  const seenRel = new Set();
  const addRel = (from, to, type, status = "derived") => {
    const k = `${from}->${to}:${type}`;
    if (seenRel.has(k)) return;
    seenRel.add(k);
    relations.push({ from, to, type, status });
  };

  const results = { capabilities: {}, modules: {}, resources: {}, runtimes: {}, contracts: {}, rules: {}, sources: {}, lines: {}, conflicts: {}, superseded: {}, drift: null };
  const put = (section, key, entry) => { results[section][key] = entry; };
  const conflictIds = new Set();
  const collectConflicts = (entry) => { if (entry && Array.isArray(entry.conflicts)) entry.conflicts.forEach((c) => conflictIds.add(c)); };

  for (const { doc } of matched.values()) {
    put(doc.section, doc.key, doc.entry);
    collectConflicts(doc.entry);
  }

  // G-2: single-hop capability expansion (bounded — never recurses the whole index)
  const expandCapability = (capKey, fromLabel) => {
    const cap = index.capabilities[capKey];
    if (!cap) return;
    for (const rt of cap.hostedBy || []) {
      if (index.runtimes[rt] && !results.runtimes[rt]) { put("runtimes", rt, index.runtimes[rt]); }
      addRel(fromLabel, `runtime:${rt}`, "hosted-by");
    }
    for (const m of cap.implementedBy || []) {
      if (index.modules[m] && !results.modules[m]) { put("modules", m, index.modules[m]); }
      addRel(fromLabel, `module:${m}`, "implemented-by");
    }
    for (const op of cap.ownsOperations || []) {
      const [res, operation] = op.split(":");
      if (index.resources[res] && !results.resources[res]) {
        put("resources", res, index.resources[res]);
        collectConflicts(index.resources[res]);
        for (const o of index.resources[res].operations || []) {
          for (const w of o.writers || []) {
            if (w.runtime && index.runtimes[w.runtime] && !results.runtimes[w.runtime]) {
              put("runtimes", w.runtime, index.runtimes[w.runtime]);
              addRel(`resource:${res}`, `runtime:${w.runtime}`, `writer-runtime(${w.status})`);
            }
          }
        }
      }
      if (res) addRel(fromLabel, `resource:${res}${operation ? ` op=${operation}` : ""}`, "owns-operation");
    }
  };

  for (const { doc } of matched.values()) {
    const e = doc.entry || {};
    if (doc.section === "runtimes" && Array.isArray(e.hosts)) {
      for (const cap of e.hosts) {
        if (index.capabilities[cap]) {
          if (!results.capabilities[cap]) put("capabilities", cap, index.capabilities[cap]);
          addRel(`runtime:${doc.key}`, `capability:${cap}`, "hosts");
          expandCapability(cap, `capability:${cap}`);
        }
      }
    }
    if (doc.section === "capabilities") {
      expandCapability(doc.key, `capability:${doc.key}`);
    }
    if (doc.section === "modules") {
      for (const [capKey, cap] of Object.entries(index.capabilities)) {
        if ((cap.implementedBy || []).includes(doc.key)) {
          if (!results.capabilities[capKey]) put("capabilities", capKey, cap);
          addRel(`module:${doc.key}`, `capability:${capKey}`, "implements");
          expandCapability(capKey, `capability:${capKey}`);
        }
      }
    }
    if (doc.section === "resources") {
      for (const op of e.operations || []) {
        for (const w of op.writers || []) {
          if (w.runtime && index.runtimes[w.runtime] && !results.runtimes[w.runtime]) {
            put("runtimes", w.runtime, index.runtimes[w.runtime]);
            addRel(`resource:${doc.key}`, `runtime:${w.runtime}`, `writer-runtime(${w.status})`);
          }
        }
      }
    }
    if ((doc.section === "rules" || doc.section === "sources") && Array.isArray(e.conflicts)) {
      e.conflicts.forEach((c) => conflictIds.add(c));
    }
  }

  // TE-1: superseded facts are quarantined — matched only into their own bucket, never active truth
  const qSet = new Set(qTokens);
  for (const [id, fact] of Object.entries(index.superseded || {})) {
    const factTokens = new Set([...tokenize(id), ...tokenize(fact.claim), ...tokenize(fact.supersededBy)]);
    const hits = qTokens.filter((t) => factTokens.has(t));
    if (hits.length >= 2 || (hits.length >= 1 && hits.includes("drift"))) {
      results.superseded[id] = { ...fact, matchedTokens: hits };
    }
  }

  // platform registry query → attach drift block
  const platformRegistryHit = results.sources.platformManifest || Object.keys(results.sources).some((k) => k.includes("platform"));
  if (platformRegistryHit && index.drift) results.drift = index.drift.platformRegistry;

  // any module matched → boundary rule applies (deterministic, not guessed)
  if (Object.keys(results.modules).length > 0 && index.rules.team_boundaries) {
    results.rules.team_boundaries = index.rules.team_boundaries;
  }

  // conflict propagation (first-class)
  for (const id of conflictIds) {
    if (index.conflicts[id]) results.conflicts[id] = index.conflicts[id];
  }

  // ---------------------------------------------------------------- safety layer (Phase 4)
  // Uncertainty must survive resolution: CONFLICTED/STALE/UNKNOWN are never packaged as certainty.
  const warnings = [];
  const negativeAssertions = [];
  const pushWarning = (w) => warnings.push(w);
  for (const [key, res] of Object.entries(results.resources)) {
    const ops = res.operations || [];
    const writerCount = ops.reduce((n, o) => n + (o.writers || []).length, 0);
    const multiOps = ops.filter((o) => o.writerCardinality === "multiple").length;
    if (res.status === "conflicted") {
      pushWarning(`CONFLICTED: resource "${key}" has conflicting evidence layers (${(res.conflicts || []).join(", ") || "see index.conflicts"}). Do not treat any single-layer claim as resolved truth. Human decision required.`);
    }
    if (multiOps > 0 || writerCount > 1) {
      negativeAssertions.push(`Do NOT assume a single/table-level writer for "${key}": observed ${writerCount} writer entries across ${ops.length} operations (field/operation ownership applies).`);
    }
    if (res.status === "stale" || res.evidenceStatus === "reaudit-required") {
      pushWarning(`STALE: resource "${key}" evidence changed since last verification (${((res.mismatchedEvidence || []).join(", ") || "unknown file")}). Re-audit required before relying on this fact.`);
    }
  }
  for (const [key, cap] of Object.entries(results.capabilities)) {
    if (cap.status === "stale" || cap.evidenceStatus === "reaudit-required") {
      pushWarning(`STALE: capability "${key}" evidence changed since verification; re-audit required.`);
    }
  }
  for (const [id, c] of Object.entries(results.conflicts)) {
    pushWarning(`CONFLICTED (${id}): ${c.topic}. Human decision required — do not auto-resolve.`);
  }
  for (const [id, fact] of Object.entries(results.superseded)) {
    pushWarning(`SUPERSEDED (${id}): "${fact.claim}" is historical only — superseded by ${fact.supersededBy}. Do not treat as current truth.`);
  }
  const humanDecisionsRequired = Object.values(results.conflicts)
    .filter((c) => c.humanDecisionRequired && c.status === "conflicted" && !c.resolution)
    .map((c) => c.id);

  // truth summary (stale and superseded counted separately — they are NOT verified)
  const countStatus = (bucket) => Object.values(bucket).filter((e) => typeof (e && e.status) === "string").reduce((acc, e) => {
    const s = e.status.startsWith("verified") ? "verified" : e.status;
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const truthSummary = {};
  for (const section of ["capabilities", "modules", "resources", "runtimes", "contracts", "rules", "sources"]) {
    const c = countStatus(results[section]);
    for (const [k, v] of Object.entries(c)) truthSummary[k] = (truthSummary[k] || 0) + v;
  }
  truthSummary.conflicted = (truthSummary.conflicted || 0) + Object.keys(results.conflicts).length;
  truthSummary.superseded = Object.keys(results.superseded).length;

  const foundTokens = new Set();
  for (const { doc, viaKey, viaValue } of matched.values()) {
    if (doc.section === "conflicts") continue;
    viaKey.forEach((t) => foundTokens.add(t));
    viaValue.forEach((t) => foundTokens.add(t));
  }
  const notFound = qTokens.filter((t) => !foundTokens.has(t));

  const primaryCount = Object.entries(results)
    .filter(([k]) => !["conflicts", "drift", "rules", "superseded"].includes(k))
    .reduce((n, [, bucket]) => n + Object.keys(bucket).length, 0);

  return {
    query,
    status: primaryCount === 0 ? "unknown" : "ok",
    statusNote: primaryCount === 0
      ? "no index evidence matched the query tokens; no guessing performed (see notFound)"
      : "matches derived deterministically from .ai/architecture/index.json only",
    results,
    relations,
    truthSummary,
    humanDecisionsRequired,
    safety: {
      uncertainty: warnings.length > 0 ? "present" : "none",
      warnings,
      negativeAssertions,
    },
    notFound,
  };
}

// CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error('usage: node .ai/architecture/resolve-context.mjs "<task description / query>"');
    process.exit(2);
  }
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, ".ai", "architecture", "index.json"), "utf8"));
  const out = resolveContext(query, index);
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.status === "unknown" ? 3 : 0);
}
