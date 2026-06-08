"use strict";

const assert = require("assert");
const { requirePlatformFeed } = require("../core/shared/adapter_paths.js");
const {
  ObFeed,
  A8_INDEX_SOURCES,
  DEFAULT_INDEX_SOURCES,
} = requirePlatformFeed("OB");

function loadObEntry() {
  delete require.cache[require.resolve("../core/shared/platform_registry.js")];
  delete require.cache[require.resolve("../core/shared/adapter_paths.js")];
  const { buildFeedHubEntries } = require("../core/shared/platform_registry.js");
  return buildFeedHubEntries().find((e) => e.id === "OB");
}

function main() {
  assert(DEFAULT_INDEX_SOURCES.length > 1, "default 应多源 index");
  const defFeed = new ObFeed();
  assert.strictEqual(defFeed.stageDelayMs, 150);

  delete process.env.OB_FEED_MODE;
  const defEntry = loadObEntry();
  assert.strictEqual(defEntry.options.indexIntervalMs, 30000);
  assert(!defEntry.options.indexSources, "default feedOptions 不强制 indexSources");

  process.env.OB_FEED_MODE = "a8";
  const a8Entry = loadObEntry();
  assert.strictEqual(a8Entry.options.feedMode, "a8");
  assert.deepStrictEqual(a8Entry.options.indexSources, A8_INDEX_SOURCES);
  assert.strictEqual(a8Entry.options.stageDelayMs, 1500);

  const a8Feed = new ObFeed(a8Entry.options);
  assert.strictEqual(a8Feed.feedMode, "a8");
  assert.strictEqual(a8Feed.indexSources.length, 1);
  assert.strictEqual(a8Feed.stageDelayMs, 1500);

  console.log("[ob-feed-mode] PASS default vs OB_FEED_MODE=a8");
}

main();
