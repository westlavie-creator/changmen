import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  getAdapterRoot,
  adapterRequire,
  initAdapterRegistry,
  requirePlatform,
  reqS,
} from "./adapter_paths.js";

beforeAll(async () => {
  await initAdapterRegistry();
});

describe("adapter_paths", () => {
  it("resolves platform_adapter with manifest.json", () => {
    const root = getAdapterRoot();
    expect(fs.existsSync(path.join(root, "registry", "manifest.json"))).toBe(true);
  });

  it("adapterRequire loads registry manifest (11 platforms)", () => {
    const { MANIFEST } = adapterRequire("registry", "paths.js");
    expect(MANIFEST).toHaveLength(11);
  });

  it("reqS loads @changmen/shared modules", () => {
    const { getDefaultMarketCode } = reqS("catalog/market_catalog.mjs");
    expect(typeof getDefaultMarketCode).toBe("function");
    expect(getDefaultMarketCode("OB")).toBeTruthy();
  });

  it("requirePlatform loads OB session module (ESM backend)", () => {
    const { obGet } = requirePlatform("OB", "node", "session.js");
    expect(typeof obGet).toBe("function");
  });

  it("requirePlatform loads RAY session module (ESM backend)", () => {
    const { login, rayGet } = requirePlatform("RAY", "node", "session.js");
    expect(typeof login).toBe("function");
    expect(typeof rayGet).toBe("function");
  });

  it("requirePlatform loads TF session module (ESM backend)", () => {
    const { tfGet, tryLoadSession } = requirePlatform("TF", "node", "session.js");
    expect(typeof tfGet).toBe("function");
    expect(typeof tryLoadSession).toBe("function");
  });

  it("requirePlatform loads TF collect_credentials (ESM backend)", async () => {
    const { getTfA8CollectCredentials } = requirePlatform("TF", "node", "collect_credentials.js");
    expect(typeof getTfA8CollectCredentials).toBe("function");
    const creds = await getTfA8CollectCredentials();
    expect(creds.provider).toBe("TF");
    expect(creds.gateway).toBeTruthy();
    expect(creds.token).toBeTruthy();
  });

  it("requirePlatform loads IA session module (ESM backend)", () => {
    const { tryLoadSession, fetchGameList } = requirePlatform("IA", "node", "session.js");
    expect(typeof tryLoadSession).toBe("function");
    expect(typeof fetchGameList).toBe("function");
  });

  it("requirePlatform loads IA collect_credentials (ESM backend)", () => {
    const { getIaA8CollectCredentials } = requirePlatform("IA", "node", "collect_credentials.js");
    const creds = getIaA8CollectCredentials();
    expect(creds.provider).toBe("IA");
    expect(creds.gateway).toBe("https://ilustre-analytics.org");
  });

  it("requirePlatform loads PB session module (ESM backend)", () => {
    const { tryLoadSession, buildAuthHeaders, parsePbTokenBalance } = requirePlatform(
      "PB", "node",
      "session.js",
    );
    expect(typeof tryLoadSession).toBe("function");
    expect(typeof buildAuthHeaders).toBe("function");
    expect(typeof parsePbTokenBalance).toBe("function");
  });

  it("requirePlatform loads PB core module (ESM backend)", () => {
    const { parseEuroOddsPayload, slugify } = requirePlatform("PB", "node", "core.js");
    expect(typeof parseEuroOddsPayload).toBe("function");
    expect(slugify("League of Legends")).toBe("league-of-legends");
  });
});
