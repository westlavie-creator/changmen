import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { buildFeedHubEntries, MANIFEST } = require("./platform_registry.js");

describe("adapter feeds", () => {
  it("buildFeedHubEntries loads every manifest feed class", () => {
    const entries = buildFeedHubEntries();
    expect(entries).toHaveLength(MANIFEST.length);
    for (const entry of entries) {
      expect(typeof entry.Feed).toBe("function");
      expect(entry.id).toBeTruthy();
      expect(entry.options).toBeTypeOf("object");
    }
  });
});
