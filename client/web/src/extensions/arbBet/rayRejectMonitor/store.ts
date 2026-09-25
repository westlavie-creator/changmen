import type { RayRejectMonitorTask } from "./types";
import { defineStore } from "pinia";
import { RAY_REJECT_MONITOR_DEFAULT_MINUTES } from "@/types/extensionPrefs";

const STORAGE_PREFIX = "changmen:ray-reject-monitor:v1";
const MAX_PERSISTED_TASKS = 100;
const REJECTED_RETENTION_MS = 24 * 60 * 60 * 1000;

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

function readTasks(userId: string): RayRejectMonitorTask[] {
  try {
    if (typeof sessionStorage === "undefined")
      return [];
    const parsed = JSON.parse(sessionStorage.getItem(storageKey(userId)) || "[]") as unknown;
    if (!Array.isArray(parsed))
      return [];
    const now = Date.now();
    return parsed.filter((value): value is RayRejectMonitorTask => {
      if (!value || typeof value !== "object")
        return false;
      const task = value as Partial<RayRejectMonitorTask>;
      if (!task.key || task.userId !== userId || !Number(task.linkId) || !Number(task.accountId))
        return false;
      if (!Number.isFinite(Number(task.monitorMinutes)) || Number(task.monitorMinutes) <= 0)
        task.monitorMinutes = RAY_REJECT_MONITOR_DEFAULT_MINUTES;
      if (task.status === "closed" || task.status === "expired")
        return false;
      if (task.status === "rejected")
        return now - Number(task.updatedAt || 0) <= REJECTED_RETENTION_MS;
      return Number(task.expiresAt) > now;
    });
  }
  catch {
    return [];
  }
}

export const useRayRejectMonitorStore = defineStore("rayRejectMonitor", {
  state: () => ({
    ownerUserId: "",
    tasks: new Map<string, RayRejectMonitorTask>(),
  }),

  getters: {
    taskForLink: state => (linkId: number): RayRejectMonitorTask | null => {
      const found = [...state.tasks.values()]
        .filter(task => task.linkId === Number(linkId) && task.status !== "closed" && task.status !== "expired")
        .sort((a, b) => b.updatedAt - a.updatedAt);
      return found[0] ?? null;
    },
    activeTasks: state => [...state.tasks.values()].filter(task =>
      task.status === "binding" || task.status === "watching" || task.status === "ambiguous"),
  },

  actions: {
    restore(userId: string) {
      const owner = String(userId || "").trim();
      if (!owner || this.ownerUserId === owner)
        return;
      this.ownerUserId = owner;
      this.tasks = new Map(readTasks(owner).map(task => [task.key, task]));
    },

    upsert(task: RayRejectMonitorTask) {
      this.tasks.set(task.key, task);
      this.persist();
    },

    patch(key: string, patch: Partial<RayRejectMonitorTask>) {
      const current = this.tasks.get(key);
      if (!current)
        return;
      this.tasks.set(key, { ...current, ...patch });
      this.persist();
    },

    remove(key: string) {
      if (!this.tasks.delete(key))
        return;
      this.persist();
    },

    persist() {
      try {
        if (!this.ownerUserId || typeof sessionStorage === "undefined")
          return;
        const rows = [...this.tasks.values()]
          .filter(task => task.status !== "closed" && task.status !== "expired")
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, MAX_PERSISTED_TASKS);
        sessionStorage.setItem(storageKey(this.ownerUserId), JSON.stringify(rows));
      }
      catch {
        /* 监控持久化失败不得影响下注主链路 */
      }
    },
  },
});
