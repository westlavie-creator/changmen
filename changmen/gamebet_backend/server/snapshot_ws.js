"use strict";

const { WebSocketServer } = require("ws");

function normalizeUpgradePath(url) {
  try {
    const p = new URL(url, "http://127.0.0.1").pathname;
    return p.endsWith("/") && p.length > 1 ? p.slice(0, -1) : p;
  } catch {
    return url.split("?")[0];
  }
}

function attachSnapshotWs(server, hub) {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set();

  server.prependListener("upgrade", (request, socket, head) => {
    if (normalizeUpgradePath(request.url) !== "/ws") return;
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  function broadcast(message) {
    const text = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === 1) client.send(text);
    }
  }

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: "snapshot", data: hub.getSnapshot() }));
    ws.on("close", () => clients.delete(ws));
  });

  hub.on((event) => broadcast(event));

  return { wss, clients };
}

module.exports = { attachSnapshotWs };
