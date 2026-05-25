import { defineStore } from "pinia";
import {
  getToken,
  getUserInfo,
  login as apiLogin,
  logout as apiLogout,
  setToken,
  updateUserSetting as apiUpdateUserSetting,
  getClientData,
  getClientDataArray,
  saveClientData,
} from "@/api/esport";
import type { UserInfo } from "@/types/esport";
import type { MessageConfig, ProxyRow } from "@/types/userExtras";
import type { FollowConfig } from "@/types/order";

const USER_KEY = "app:userName";
const HIDDEN_NAME_KEY = "hiddenUserName";

/** 对齐 A8 Pinia `Xn`（用户 / 登录态） */
export const useUserStore = defineStore("user", {
  state: () => ({
    userName: localStorage.getItem(USER_KEY) || "admin",
    userId: 0,
    setting: {} as Record<string, unknown>,
    ready: false,
    error: null as string | null,
    apiDelay: 0,
    hiddenUserName: localStorage.getItem(HIDDEN_NAME_KEY) === "1",
    proxyList: [] as ProxyRow[],
    message: {} as MessageConfig,
    follow: null as FollowConfig | null,
    delayTimer: null as ReturnType<typeof setInterval> | null,
  }),

  getters: {
    isLoggedIn: () => Boolean(getToken()),

    displayName(state): string {
      return state.hiddenUserName ? String(state.userId || "—") : state.userName;
    },

    delayLevel(state): "ok" | "warn" | "bad" | "none" {
      if (!state.apiDelay) return "none";
      if (state.apiDelay < 100) return "ok";
      if (state.apiDelay < 500) return "warn";
      return "bad";
    },

    followEnabled(state): boolean {
      return Boolean(state.setting?.Follow);
    },
  },

  actions: {
    async login(password: string, userName?: string) {
      const name = userName ?? this.userName;
      this.error = null;
      const info = await apiLogin(name, password);
      this.userName = info.userName;
      this.userId = info.ID;
      localStorage.setItem(USER_KEY, info.userName);
      await this.fetchUserInfo();
      return info;
    },

    async fetchUserInfo() {
      if (!getToken()) {
        this.ready = false;
        return;
      }
      try {
        const info: UserInfo = await getUserInfo();
        this.userId = info.ID;
        this.userName = info.UserName;
        this.setting = info.Setting ?? {};
        await this.loadExtras();
        this.ready = true;
        this.error = null;
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e);
        this.ready = false;
        throw e;
      }
    },

    async restoreSession() {
      if (!getToken()) {
        this.ready = false;
        return false;
      }
      try {
        await this.fetchUserInfo();
        return true;
      } catch {
        setToken(null);
        this.ready = false;
        return false;
      }
    },

    async logout() {
      this.stopDelayPing();
      await apiLogout();
      this.userId = 0;
      this.setting = {};
      this.proxyList = [];
      this.message = {};
      this.follow = null;
      this.ready = false;
    },

    async loadExtras() {
      const proxies = await getClientDataArray<ProxyRow>("PROXY");
      this.proxyList = proxies.filter((p) => p?.proxyId != null);
      const msg = await getClientData<MessageConfig>("Message");
      this.message = msg ?? {};
      const follow = await getClientData<FollowConfig & Record<string, unknown>>("Follow");
      this.follow = follow ?? null;
    },

    async saveFollowConfig(payload: FollowConfig) {
      await saveClientData("Follow", JSON.stringify(payload));
      this.follow = payload;
    },

    async saveProxyList() {
      await saveClientData("PROXY", JSON.stringify(this.proxyList));
    },

    async saveMessageConfig() {
      await saveClientData("Message", JSON.stringify(this.message));
    },

    async deleteProxy(proxyId: number) {
      const { useAccountStore } = await import("@/stores/accountStore");
      const accounts = useAccountStore().accounts;
      const inUse = accounts.some((a) => a.proxyId === proxyId);
      if (inUse) {
        throw new Error("当前代理正在被账号使用");
      }
      this.proxyList = this.proxyList.filter((p) => p.proxyId !== proxyId);
      await this.saveProxyList();
    },

    toggleHiddenUserName() {
      this.hiddenUserName = !this.hiddenUserName;
      localStorage.setItem(HIDDEN_NAME_KEY, this.hiddenUserName ? "1" : "0");
    },

    async pingDelay() {
      if (!getToken()) return;
      const start = Date.now();
      try {
        await getUserInfo();
        this.apiDelay = Date.now() - start;
      } catch {
        this.apiDelay = 9999;
      }
    },

    startDelayPing() {
      this.stopDelayPing();
      void this.pingDelay();
      this.delayTimer = setInterval(() => void this.pingDelay(), 5000);
    },

    stopDelayPing() {
      if (this.delayTimer) {
        clearInterval(this.delayTimer);
        this.delayTimer = null;
      }
    },

    async patchSetting(patch: Record<string, unknown>) {
      const next = await apiUpdateUserSetting(patch);
      this.setting = { ...this.setting, ...next };
      return next;
    },

    betTargetEnabled(): boolean {
      return Boolean(this.setting?.BetTarget);
    },
  },
});
