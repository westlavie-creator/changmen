import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { getAdapterRoot, adapterRequire, BACKEND_ROOT, requirePlatform } = require("./adapter_paths.js");

describe("adapter_paths", () => {
  it("resolves platform_adapter with manifest.json", () => {
    const root = getAdapterRoot();
    expect(fs.existsSync(path.join(root, "registry", "manifest.json"))).toBe(true);
  });

  it("adapterRequire loads registry manifest (11 platforms)", () => {
    const { MANIFEST } = adapterRequire("registry", "paths.js");
    expect(MANIFEST).toHaveLength(11);
  });

  it("requirePlatform loads OB session module", () => {
    const { obGet } = requirePlatform("OB", "backend", "session.js");
    expect(typeof obGet).toBe("function");
  });
});
