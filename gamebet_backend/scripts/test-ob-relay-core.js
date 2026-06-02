#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { EventEmitter } = require("events");
const { ObRelayCore } = require("../relays/ob_relay_core.js");

class FakeMqttClient extends EventEmitter {
  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    this.connected = false;
    this.subscriptions = [];
    this.unsubscriptions = [];
    this.publications = [];
    this.ended = false;
    FakeMqttClient.instances.push(this);
  }

  subscribe(topic, cb) {
    this.subscriptions.push(topic);
    if (cb) cb(null);
  }

  unsubscribe(topic) {
    this.unsubscriptions.push(topic);
  }

  publish(topic, payload) {
    this.publications.push({ topic, payload });
  }

  end() {
    this.ended = true;
    this.connected = false;
  }

  open() {
    this.connected = true;
    this.emit("connect");
  }
}

FakeMqttClient.instances = [];

async function waitTick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function main() {
  let syncedSession = null;
  const core = new ObRelayCore(
    {},
    {
      login: async () => ({
        token: "ob-token",
        mqttEndpoints: ["wss://ob-one.example/mqtt", "wss://ob-two.example/mqtt"],
      }),
      syncObFromSession: (session) => {
        syncedSession = session;
      },
      mqttConnect: (url, options) => new FakeMqttClient(url, options),
    },
  );

  const messages = [];
  core.onMessage((topic, payload) => messages.push({ topic, payload }));

  core.subscribeTopic("/market/oddsUpdate/123");
  core.start();
  await waitTick();

  const client = FakeMqttClient.instances[0];
  assert(client, "fake mqtt client should be created");
  assert.strictEqual(client.url, "wss://ob-one.example/mqtt");
  assert.strictEqual(client.options.username, "ob-token");
  assert.strictEqual(client.options.protocolId, "MQTT");
  assert.deepStrictEqual(syncedSession, {
    token: "ob-token",
    mqttEndpoints: ["wss://ob-one.example/mqtt", "wss://ob-two.example/mqtt"],
  });

  client.open();
  assert.strictEqual(core.getStatus().upstreamConnected, true);
  assert.deepStrictEqual(client.subscriptions, ["/market/oddsUpdate/123"]);

  core.subscribeTopic("/market/statusUpdate/123");
  assert.deepStrictEqual(client.subscriptions, [
    "/market/oddsUpdate/123",
    "/market/statusUpdate/123",
  ]);

  const payload = Buffer.from('[{"id":1}]');
  client.emit("message", "/market/oddsUpdate/123", payload);
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].topic, "/market/oddsUpdate/123");
  assert.strictEqual(messages[0].payload, payload);

  assert.strictEqual(core.publish("/client/ping", Buffer.from("x")), true);
  assert.strictEqual(client.publications[0].topic, "/client/ping");

  core.unsubscribeTopic("/market/statusUpdate/123");
  assert.deepStrictEqual(client.unsubscriptions, ["/market/statusUpdate/123"]);

  core.stop();
  assert.strictEqual(client.ended, true);
  assert.strictEqual(core.getStatus().upstreamConnected, false);

  console.log("[ob-relay-core] PASS start, subscribe, message, publish, stop");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
