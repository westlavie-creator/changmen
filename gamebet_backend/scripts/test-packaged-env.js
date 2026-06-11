"use strict";

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");

const {
  packagedEnvCandidates,
  loadPackagedEnv,
  hasSupabaseEnv,
} = require("../core/shared/packaged_env.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gamebet-env-test-"));
const userData = path.join(tmp, "gamebet-backend");
fs.mkdirSync(userData, { recursive: true });
const envFile = path.join(userData, ".env");
fs.writeFileSync(
  envFile,
  "SUPABASE_URL=https://example.supabase.co\nSUPABASE_KEY=test-key\n",
  "utf8",
);

const candidates = packagedEnvCandidates({
  isPackaged: true,
  execPath: path.join(tmp, "GameBet.exe"),
  userDataDir: userData,
});

assert.ok(candidates.some((p) => p.endsWith(".env")), "candidates must include .env paths");
assert.ok(candidates.includes(envFile), "must include userData .env");

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_KEY;
delete process.env.SUPABASE_SERVICE_KEY;

const loaded = loadPackagedEnv({
  isPackaged: true,
  execPath: path.join(tmp, "GameBet.exe"),
  userDataDir: userData,
});
assert.strictEqual(loaded, envFile);
assert.strictEqual(hasSupabaseEnv(), true);

const bundledPath = path.join(tmp, "resources", "config", "supabase.env");
fs.mkdirSync(path.dirname(bundledPath), { recursive: true });
fs.writeFileSync(
  bundledPath,
  "SUPABASE_URL=https://bundled.supabase.co\nSUPABASE_KEY=bundled-key\n",
  "utf8",
);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_KEY;
const origAppData = process.env.APPDATA;
process.env.APPDATA = path.join(tmp, "fake-appdata");
const loadedBundled = loadPackagedEnv({
  isPackaged: true,
  execPath: path.join(tmp, "GameBet.exe"),
  userDataDir: path.join(tmp, "empty-userdata"),
  resourcesPath: path.join(tmp, "resources"),
});
process.env.APPDATA = origAppData;
assert.strictEqual(loadedBundled, bundledPath);
assert.strictEqual(hasSupabaseEnv(), true);

const emptyUserData = path.join(tmp, "empty-user");
fs.mkdirSync(emptyUserData, { recursive: true });
fs.writeFileSync(
  path.join(emptyUserData, ".env"),
  "SUPABASE_URL=\nSUPABASE_KEY=\n",
  "utf8",
);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_KEY;
process.env.APPDATA = path.join(tmp, "fake-appdata");
const loadedSkipEmpty = loadPackagedEnv({
  isPackaged: true,
  execPath: path.join(tmp, "GameBet.exe"),
  userDataDir: emptyUserData,
  resourcesPath: path.join(tmp, "resources"),
});
process.env.APPDATA = origAppData;
assert.strictEqual(loadedSkipEmpty, bundledPath);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("packaged_env OK");
