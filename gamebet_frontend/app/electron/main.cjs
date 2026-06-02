"use strict";

const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");

const APP_ROOT = path.join(__dirname, "..");
const CHANGMEN_ROOT = path.resolve(APP_ROOT, "..", "..");
const BACKEND_ROOT = path.join(CHANGMEN_ROOT, "gamebet_backend");

process.env.GAMEBET_BACKEND_ROOT = process.env.GAMEBET_BACKEND_ROOT || BACKEND_ROOT;
process.env.GAMEBET_CHANGMEN_ROOT = process.env.GAMEBET_CHANGMEN_ROOT || CHANGMEN_ROOT;

const { RayRelayCore } = require(path.join(BACKEND_ROOT, "relays", "ray_relay_core.js"));
const { ObRelayCore } = require(path.join(BACKEND_ROOT, "relays", "ob_relay_core.js"));

let mainWindow = null;

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function createRayService() {
  let core = null;

  function ensureCore() {
    if (core) return core;
    core = new RayRelayCore({}, { syncRayFromSession: () => false });
    core.onMessage((payload) => {
      broadcast("gamebet:relay:ray:message", payload);
    });
    return core;
  }

  return {
    async start() {
      const relay = ensureCore();
      const status = relay.getStatus();
      if (status.upstreamConnected) return status;
      await relay.start();
      return relay.getStatus();
    },
    async stop() {
      if (!core) return { platform: "RAY", upstreamConnected: false };
      await core.stop();
      const status = core.getStatus();
      core = null;
      return status;
    },
    status() {
      return core ? core.getStatus() : { platform: "RAY", upstreamConnected: false };
    },
  };
}

function createObService() {
  let core = null;

  function ensureCore() {
    if (core) return core;
    core = new ObRelayCore({}, { syncObFromSession: () => false });
    core.onMessage((topic, payload) => {
      broadcast("gamebet:relay:ob:message", {
        topic,
        payload: Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload ?? ""),
      });
    });
    return core;
  }

  return {
    start() {
      const relay = ensureCore();
      relay.start();
      return relay.getStatus();
    },
    stop() {
      if (!core) return { platform: "OB", upstreamConnected: false };
      core.stop();
      const status = core.getStatus();
      core = null;
      return status;
    },
    status() {
      return core ? core.getStatus() : { platform: "OB", upstreamConnected: false };
    },
    subscribe(topic) {
      ensureCore().subscribeTopic(String(topic));
      return this.status();
    },
    unsubscribe(topic) {
      if (core) core.unsubscribeTopic(String(topic));
      return this.status();
    },
    publish(topic, payload) {
      return ensureCore().publish(String(topic), Buffer.from(String(payload ?? ""), "utf8"));
    },
  };
}

const rayService = createRayService();
const obService = createObService();

function registerRelayIpc() {
  ipcMain.handle("gamebet:relay:ray:start", () => rayService.start());
  ipcMain.handle("gamebet:relay:ray:stop", () => rayService.stop());
  ipcMain.handle("gamebet:relay:ray:status", () => rayService.status());

  ipcMain.handle("gamebet:relay:ob:start", () => obService.start());
  ipcMain.handle("gamebet:relay:ob:stop", () => obService.stop());
  ipcMain.handle("gamebet:relay:ob:status", () => obService.status());
  ipcMain.handle("gamebet:relay:ob:subscribe", (_event, topic) => obService.subscribe(topic));
  ipcMain.handle("gamebet:relay:ob:unsubscribe", (_event, topic) => obService.unsubscribe(topic));
  ipcMain.handle("gamebet:relay:ob:publish", (_event, topic, payload) => obService.publish(topic, payload));
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  const devUrl = process.env.GAMEBET_ELECTRON_DEV_URL;
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadFile(path.join(APP_ROOT, "dist", "index.html"));
  }
}

registerRelayIpc();

app.whenReady().then(createWindow);

app.on("window-all-closed", async () => {
  await rayService.stop();
  obService.stop();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
