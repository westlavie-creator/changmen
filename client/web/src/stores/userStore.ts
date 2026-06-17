import { defineStore } from "pinia";
import {
  getToken,
  getUserInfo,
  login as apiLogin,
  logout as apiLogout,
  updateUserSetting as apiUpdateUserSetting,
  getClientData,
  getClientDataArray,
  saveClientData,
} from "@/api/esport";
import { clearAuthSession, getRefreshToken } from "@/api/client";
import { ensureTokenRefresh, stopTokenRefresh } from "@/lib/sessionRefresh";
import type { UserInfo } from "@/types/esport";
import type { MessageConfig, ProxyRow } from "@/types/userExtras";
import type { FollowConfig } from "@/types/order";
import { subscribeUserChannel, unsubscribeUserChannel } from "@/realtime/userChannel";

const USER_KEY = "app:userName";
const HIDDEN_NAME_KEY = "hiddenUserName";

/** 对齐 A8 Pinia `Xn`（用户 / 登录态） */
export const useUserStore = defineStore("user", {
  state: () => ({
    userName: localStorage.getItem(USER_KEY) || "",
    userId: 0,
    setting: {} as Record<string, unknown>,
    /** 平博 v4 用 A8 账号，来自 GetUserInfo 或 /api/a8/credit-plate-user */
    creditPlateUserName: "",
    /** restoreSession / 无 token 判定完成后为 true，避免已登录刷新闪登录框 */
    sessionChecked: !getToken(),
    ready: false,
    error: null as string | null,
    apiDelay: 0,
    hiddenUserName: localStorage.getItem(HIDDEN_NAME_KEY) === "1",
    proxyList: [] as ProxyRow[],
    message: {} as MessageConfig,
    follow: null as FollowConfig | null,
    extrasLoaded: false,
    isAdmin: false,
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
        this.isAdmin = info.IsAdmin === true || info.IsAdmin === 1;
        const cp = info.CreditPlateUserName?.trim();
        if (cp) this.creditPlateUserName = cp;
        await this.loadExtras();
        void subscribeUserChannel(this.userId).catch((err) => {
          console.warn("[goeasy] USER channel:", err);
        });
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
        this.sessionChecked = true;
        return false;
      }
      // 提前启动 JWT refresh，防止 token 在使用中到期
      const rft = getRefreshToken();
      if (rft) {
        void ensureTokenRefresh();
      }
      try {
        await this.fetchUserInfo();
        return true;
      } catch {
        clearAuthSession();
        this.ready = false;
        return false;
      } finally {
        this.sessionChecked = true;
      }
    },

    async logout() {
      unsubscribeUserChannel();
      await stopTokenRefresh();
      await apiLogout();
      this.userName = "";
      this.userId = 0;
      this.setting = {};
      this.creditPlateUserName = "";
      this.proxyList = [];
      this.message = {};
      this.follow = null;
      this.extrasLoaded = false;
      this.isAdmin = false;
      this.ready = false;
      localStorage.removeItem(USER_KEY);
    },

    async loadExtras(force = false) {
      if (this.extrasLoaded && !force) return;
      const proxies = await getClientDataArray<ProxyRow>("PROXY");
      this.proxyList = proxies.filter((p) => p?.proxyId != null);
      const msg = await getClientData<MessageConfig>("Message");
      this.message = msg ?? {};
      const follow = await getClientData<FollowConfig & Record<string, unknown>>("Follow");
      this.follow = follow ?? null;
      this.extrasLoaded = true;
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

    setApiDelay(ms: number) {
      this.apiDelay = ms > 0 ? ms : 0;
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
