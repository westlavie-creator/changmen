#!/usr/bin/env node
"use strict";

const mqtt = require("mqtt");
const socketClusterClient = require("socketcluster-client");

const HOST = process.env.RELAY_HOST?.split(":")[0] || "127.0.0.1";
const PORT = process.env.RELAY_HOST?.split(":")[1] || "3456";
const TIMEOUT_MS = 20000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testObRelay() {
  return new Promise((resolve) => {
    const client = mqtt.connect(`ws://${HOST}:${PORT}/esport/ws/OB`, {
      username: process.env.OB_PROXY_MQTT_USER || "admin",
      password: process.env.OB_PROXY_MQTT_PASS || "Qazqaz123...",
      clientId: `smoke_ob_${Date.now()}`,
      protocolId: "MQTT",
      protocolVersion: 4,
      reconnectPeriod: 0,
      connectTimeout: TIMEOUT_MS,
    });

    let msgs = 0;
    const timer = setTimeout(() => {
      client.end(true);
      resolve({ ok: false, error: "timeout waiting for OB MQTT connect" });
    }, TIMEOUT_MS);

    client.on("connect", () => {
      client.subscribe("/market/oddsUpdate/1", (err) => {
        if (err) {
          clearTimeout(timer);
          client.end(true);
          resolve({ ok: false, error: err.message });
        }
      });
    });

    client.on("message", () => {
      msgs += 1;
    });

    client.on("error", (err) => {
      clearTimeout(timer);
      client.end(true);
      resolve({ ok: false, error: err.message });
    });

    setTimeout(() => {
      clearTimeout(timer);
      client.end(true);
      resolve({ ok: true, connected: true, messages: msgs });
    }, 8000);
  });
}

async function testRayRelay() {
  const socket = socketClusterClient.create({
    hostname: HOST,
    port: Number(PORT),
    secure: false,
    path: "/esport/ws/RAY",
    protocolVersion: 1,
    autoConnect: true,
    connectTimeout: TIMEOUT_MS,
    ackTimeout: 10000,
  });

  try {
    const channel = socket.subscribe("match");
    await channel.listener("subscribe").once();
    let msgs = 0;
    const consume = (async () => {
      for await (const _payload of channel) {
        msgs += 1;
        if (msgs >= 1) break;
      }
    })();

    await Promise.race([consume, wait(8000)]);
    socket.disconnect();
    return { ok: true, connected: socket.state === "open", messages: msgs };
  } catch (err) {
    try {
      socket.disconnect();
    } catch {
      /* ignore */
    }
    return { ok: false, error: err.message };
  }
}

async function fetchProxyStatus() {
  const res = await fetch(`http://${HOST}:${PORT}/api/proxy/status`);
  return res.json();
}

async function main() {
  console.log(`WS smoke test → http://${HOST}:${PORT}`);
  const status = await fetchProxyStatus();
  console.log("proxy status:", JSON.stringify(status, null, 2));

  const ob = await testObRelay();
  console.log("OB relay:", ob);

  const ray = await testRayRelay();
  console.log("RAY relay:", ray);

  const ok = ob.ok && ray.ok;
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
