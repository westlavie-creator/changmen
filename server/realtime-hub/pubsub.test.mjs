import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { io as ioc } from "socket.io-client";
import { attachChangmenRealtimeHub, closeChangmenRealtimeHub } from "./hub.js";
import {
  MAX_PUBSUB_CHANNEL_LEN,
  MAX_PUBSUB_MESSAGE_LEN,
  normalizePubSubChannel,
} from "./pubsub.js";

test("normalizePubSubChannel", () => {
  assert.equal(normalizePubSubChannel(" BetTarget "), "BetTarget");
  assert.equal(normalizePubSubChannel(""), null);
  assert.equal(normalizePubSubChannel("x".repeat(MAX_PUBSUB_CHANNEL_LEN + 1)), null);
});

test("pubsub publish delivers to subscriber not publisher", async () => {
  const server = http.createServer();
  attachChangmenRealtimeHub(server);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import("node:net").AddressInfo} */ (server.address()).port;

  const token = "test-token";
  const publisher = ioc(`http://127.0.0.1:${port}`, {
    path: "/esport/realtime/socket.io",
    transports: ["websocket"],
    auth: { token },
    extraHeaders: { token },
  });
  const subscriber = ioc(`http://127.0.0.1:${port}`, {
    path: "/esport/realtime/socket.io",
    transports: ["websocket"],
    auth: { token },
    extraHeaders: { token },
  });

  await Promise.all([
    new Promise((resolve) => publisher.on("connect", resolve)),
    new Promise((resolve) => subscriber.on("connect", resolve)),
  ]);

  const channel = "BetTarget";
  await new Promise((resolve, reject) => {
    subscriber.emit("pubsub:subscribe", { channel }, (ack) => {
      if (ack?.ok)
        resolve(undefined);
      else reject(new Error(ack?.error || "subscribe failed"));
    });
  });

  const received = new Promise((resolve) => {
    subscriber.on("pubsub:message", (packet) => {
      if (packet.channel === channel)
        resolve(packet.content);
    });
  });

  await new Promise((resolve, reject) => {
    publisher.emit("pubsub:publish", { channel, message: "{\"PB\":{\"1\":\"Home\"}}" }, (ack) => {
      if (ack?.ok)
        resolve(undefined);
      else reject(new Error(ack?.error || "publish failed"));
    });
  });

  assert.equal(await received, "{\"PB\":{\"1\":\"Home\"}}");

  let publisherGot = false;
  publisher.on("pubsub:message", () => {
    publisherGot = true;
  });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(publisherGot, false);

  publisher.close();
  subscriber.close();
  closeChangmenRealtimeHub();
  await new Promise((resolve) => server.close(resolve));
});

test("pubsub rejects oversized message", async () => {
  const server = http.createServer();
  attachChangmenRealtimeHub(server);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import("node:net").AddressInfo} */ (server.address()).port;

  const token = "test-token";
  const client = ioc(`http://127.0.0.1:${port}`, {
    path: "/esport/realtime/socket.io",
    transports: ["websocket"],
    auth: { token },
    extraHeaders: { token },
  });
  await new Promise((resolve) => client.on("connect", resolve));

  const ack = await new Promise((resolve) => {
    client.emit(
      "pubsub:publish",
      { channel: "BetTarget", message: "x".repeat(MAX_PUBSUB_MESSAGE_LEN + 1) },
      (response) => resolve(response),
    );
  });
  assert.equal(ack.ok, false);

  client.close();
  closeChangmenRealtimeHub();
  await new Promise((resolve) => server.close(resolve));
});
