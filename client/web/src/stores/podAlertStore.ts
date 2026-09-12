import { defineStore } from "pinia";
import { a8PluginConnect, type A8PluginPort } from "@changmen/client-core/chrome-plugin/bridge";
import {
  parsePodAlertsSnapshot,
  type PodAlertsSnapshot,
  type PodDropAlert,
} from "@/runtime/podAlerts";

export const POD_ALERTS_PORT = "pod-alerts";
const RETRY_MS = 2000;

let port: A8PluginPort | null = null;
let retryTimer = 0;

function emptySnapshot(): PodAlertsSnapshot {
  return {
    alerts: [],
    books: [],
    capturedAt: 0,
    href: "",
    gridFound: false,
    sourceConnected: false,
  };
}

export const usePodAlertStore = defineStore("podAlerts", {
  state: () => ({
    snapshot: emptySnapshot(),
    portReady: false,
    started: false,
  }),
  getters: {
    alerts(): PodDropAlert[] {
      return this.snapshot.alerts;
    },
    sourceConnected(): boolean {
      return this.snapshot.sourceConnected;
    },
  },
  actions: {
    applySnapshot(raw: unknown) {
      this.snapshot = parsePodAlertsSnapshot(raw);
    },
    start() {
      if (this.started)
        return;
      this.started = true;
      this.connect();
    },
    stop() {
      this.started = false;
      this.disconnect();
      this.snapshot = emptySnapshot();
    },
    connect() {
      this.clearPort();
      if (!this.started)
        return;
      const next = a8PluginConnect(POD_ALERTS_PORT);
      if (!next) {
        this.portReady = false;
        this.scheduleRetry();
        return;
      }
      port = next;
      this.portReady = true;
      next.onMessage.addListener((message) => {
        this.applySnapshot(message);
      });
      next.onDisconnect.addListener(() => {
        if (port === next)
          port = null;
        this.portReady = false;
        this.scheduleRetry();
      });
    },
    disconnect() {
      this.clearRetry();
      this.clearPort();
    },
    clearPort() {
      const current = port;
      port = null;
      this.portReady = false;
      try {
        current?.disconnect();
      }
      catch { /* ignore */ }
    },
    clearRetry() {
      if (!retryTimer)
        return;
      clearTimeout(retryTimer);
      retryTimer = 0;
    },
    scheduleRetry() {
      if (!this.started || retryTimer)
        return;
      retryTimer = window.setTimeout(() => {
        retryTimer = 0;
        this.connect();
      }, RETRY_MS);
    },
  },
});
