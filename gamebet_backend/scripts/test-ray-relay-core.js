#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { RayRelayCore } = require("../relays/ray_relay_core.js");

class FakeRayClient {
  constructor(options) {
    this.options = options;
    this.connected = false;
    this.lastError = null;
    this.oddsHandler = null;
    this.matchHandler = null;
    FakeRayClient.instances.push(this);
  }

  onOdds(fn) {
    this.oddsHandler = fn;
  }

  onMatch(fn) {
    this.matchHandler = fn;
  }

  async connect() {
    this.connected = true;
    return true;
  }

  disconnect() {
    this.connected = false;
  }
}

FakeRayClient.instances = [];

async function main() {
  let syncedSession = null;
  const core = new RayRelayCore(
    {
      hostname: "ignored-host",
      path: "/ignored/",
      channel: "ignored-channel",
      token: "fallback-token",
      origin: "https://fallback.example",
    },
    {
      login: async () => ({
        token: "session-token",
        origin: "https://ray164.com",
      }),
      syncRayFromSession: (session) => {
        syncedSession = session;
      },
      clientFactory: (options) => new FakeRayClient(options),
    },
  );

  const messages = [];
  core.onMessage((payload) => messages.push(payload));

  const ok = await core.start();
  assert.strictEqual(ok, true);
  assert.deepStrictEqual(syncedSession, {
    token: "session-token",
    origin: "https://ray164.com",
  });

  const client = FakeRayClient.instances[0];
  assert(client, "fake client should be created");
  assert.strictEqual(client.options.hostname, "ignored-host");
  assert.strictEqual(client.options.path, "/ignored/");
  assert.strictEqual(client.options.channel, "ignored-channel");
  assert.strictEqual(client.options.token, "session-token");
  assert.strictEqual(client.options.origin, "https://ray164.com");

  client.oddsHandler([{ id: 1, odds: 1.95 }], { source: "odds", odds: [{ id: 1 }] });
  client.matchHandler({ id: 9 }, { source: "match", match: { id: 9 } });

  assert.strictEqual(messages.length, 2);
  assert.strictEqual(messages[0].source, "odds");
  assert.strictEqual(messages[1].source, "match");

  const status = core.getStatus();
  assert.strictEqual(status.upstreamConnected, true);
  assert.strictEqual(status.messagesReceived, 2);
  assert(status.lastUpstreamAt > 0);

  await core.stop();
  assert.strictEqual(core.getStatus().upstreamConnected, false);

  console.log("[ray-relay-core] PASS start, emit, status, stop");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
