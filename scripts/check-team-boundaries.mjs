#!/usr/bin/env node
/**
 * 单仓团队边界：扫描 import/require，禁止跨团队源码耦合。
 * 规则见 docs/TEAM_BOUNDARIES.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHANGMEN_ROOT = path.resolve(__dirname, "..");

const SOURCE_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".vue"]);

/** @type {{ id: string, roots: string[], forbid: RegExp[], allowFiles?: string[] }[]} */
const RULES = [
  {
    id: "client-app",
    roots: ["client/web/src", "client/chrome-extension/src"],
    forbid: [
      /@changmen\/db\b/,
      /@changmen\/match-engine\b/,
      /@changmen\/platform-node\b/,
      /(?:^|[/\\])server[/\\]backend(?:[/\\]|$)/,
      /(?:^|[/\\])server[/\\]matcher(?:[/\\]|$)/,
      /(?:^|[/\\])server[/\\]db(?:[/\\]|$)/,
      /(?:^|[/\\])server[/\\]match-engine(?:[/\\]|$)/,
      /(?:^|[/\\])server[/\\]platform-node(?:[/\\]|$)/,
      /(?:^|[/\\])server[/\\]team-resolver(?:[/\\]|$)/,
    ],
  },
  {
    id: "client-scripts",
    roots: ["client/web/scripts"],
    forbid: [
      /@changmen\/db\b/,
      /@changmen\/platform-node\b/,
      /(?:^|[/\\])server[/\\]backend(?:[/\\]|$)/,
      /(?:^|[/\\])server[/\\]matcher(?:[/\\]|$)/,
    ],
  },
  {
    id: "platform-adapter-frontend",
    roots: [],
    forbid: [
      /@changmen\/db\b/,
      /@changmen\/match-engine\b/,
      /@changmen\/platform-node\b/,
      /(?:^|[/\\])server[/\\]backend(?:[/\\]|$)/,
      /(?:^|[/\\])client[/\\]web(?:[/\\]|$)/,
      /(?:^|[/\\])server[/\\]matcher(?:[/\\]|$)/,
    ],
  },
  {
    id: "server-backend",
    roots: ["server/backend"],
    forbid: [
      /(?:^|[/\\])client[/\\]platform-adapter[/\\][^/\\]+[/\\]frontend(?:[/\\]|$)/,
      /platform-adapter[/\\][^/\\]+[/\\]frontend(?:[/\\]|$)/,
      /(?:^|[/\\])client[/\\]web[/\\]src(?:[/\\]|$)/,
      /(?:^|[/\\])server[/\\]matcher(?:[/\\]|$)/,
    ],
    allowFiles: [
      "server/backend/scripts/test-packaged-adapter-layout.js",
      "server/backend/core/shared/adapter_paths.test.mjs",
    ],
  },
  {
    id: "server-matcher",
    roots: ["server/matcher"],
    forbid: [
      /(?:^|[/\\])client[/\\]web(?:[/\\]|$)/,
      /(?:^|[/\\])client[/\\]platform-adapter[/\\][^/\\]+[/\\]frontend(?:[/\\]|$)/,
      /platform-adapter[/\\][^/\\]+[/\\]frontend(?:[/\\]|$)/,
    ],
  },
];

function discoverPlatformFrontendRoots() {
  const adapterRoot = path.join(CHANGMEN_ROOT, "client/platform-adapter");
  if (!fs.existsSync(adapterRoot)) return [];
  return fs
    .readdirSync(adapterRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules")
    .map((d) => path.join("client/platform-adapter", d.name, "frontend"))
    .filter((rel) => fs.existsSync(path.join(CHANGMEN_ROOT, rel)));
}

const frontendRule = RULES.find((r) => r.id === "platform-adapter-frontend");
frontendRule.roots = discoverPlatformFrontendRoots();

const IMPORT_RE =
  /(?:import\s+(?:type\s+)?(?:[\w*{}\s,]+)\s+from\s+|import\s+|export\s+(?:type\s+)?(?:\*|{[^}]*})\s+from\s+|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;

function listSourceFiles(dir) {
  const out = [];
  function walk(abs) {
    if (!fs.existsSync(abs)) return;
    for (const name of fs.readdirSync(abs)) {
      if (name === "node_modules" || name === "dist") continue;
      const p = path.join(abs, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (SOURCE_EXT.has(path.extname(name))) out.push(p);
    }
  }
  walk(dir);
  return out;
}

function relPosix(filePath) {
  return path.relative(CHANGMEN_ROOT, filePath).split(path.sep).join("/");
}

function lineOf(content, index) {
  return content.slice(0, index).split("\n").length;
}

function checkFile(rule, filePath, content, violations) {
  const rel = relPosix(filePath);
  if (rule.allowFiles?.includes(rel)) return;

  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(content)) !== null) {
    const spec = m[1];
    for (const re of rule.forbid) {
      if (re.test(spec)) {
        violations.push({
          rule: rule.id,
          file: rel,
          line: lineOf(content, m.index),
          spec,
          pattern: re.source,
        });
      }
    }
  }
}

function main() {
  const violations = [];

  for (const rule of RULES) {
    for (const root of rule.roots) {
      const abs = path.join(CHANGMEN_ROOT, root);
      for (const file of listSourceFiles(abs)) {
        const content = fs.readFileSync(file, "utf8");
        checkFile(rule, file, content, violations);
      }
    }
  }

  if (violations.length === 0) {
    console.log("check-team-boundaries: OK");
    return;
  }

  console.error(`check-team-boundaries: ${violations.length} violation(s)\n`);
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}:${v.line}`);
    console.error(`    import "${v.spec}"`);
    console.error(`    matched /${v.pattern}/\n`);
  }
  console.error("See changmen/docs/TEAM_BOUNDARIES.md");
  process.exit(1);
}

main();
