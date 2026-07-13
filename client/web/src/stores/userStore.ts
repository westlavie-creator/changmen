import type { UserInfo } from "@/types/esport";
import type { FollowConfig } from "@/types/order";
import type { ExtensionPrefs } from "@/types/extensionPrefs";
import type { MessageConfig, ProxyRow } from "@/types/userExtras";
import type { UserConfig } from "@/types/userConfig";
import { createDefaultExtensionPrefs, normalizeExtensionPrefs } from "@/types/extensionPrefs";
import { defineStore } from "pinia";
import { toRaw } from "vue";
import { clearAuthSession, getRefreshToken } from "@/api/client";
import {
  login as apiLogin,
  logout as apiLogout,
  updateUserSetting as apiUpdateUserSetting,
  getClientData,
  getClientDataArray,
  getToken,
  getUserInfo,
  saveClientData,
  saveClientDataDetailed,
} from "@/api/esport";
import { ensureTokenRefresh, stopTokenRefresh } from "@/lib/sessionRefresh";
import { subscribeUserChannel, unsubscribeUserChannel } from "@/realtime/userChannel";
import { ensureBetTargetChannelSubscribed } from "@/realtime/betTargetChannel";
import { ensurePublishChannelSubscribed } from "@/realtime/publishChannel";
import {
  createDefaultUserConfig,
  mergeUserConfig,
} from "@/types/userConfig";

const USER_KEY = "app:userName";
const HIDDEN_NAME_KEY = "hiddenUserName";
const CONFIG_KEY = "USERCONFIG";

export interface ConfigSaveResult {
  ok: boolean;
  msg?: string;
}

/** 对齐 A8 Pinia `Pn`（`g=Pn()`）：用户 / 登录态 + `config`（A8 `g.config`） */
export const useUserStore = defineStore("user", {
  state: () => ({
    userName: localStorage.getItem(USER_KEY) || "",
    userId: 0,
    setting: {} as Record<string, unknown>,
    /** 对齐 A8 `g.config`（USERCONFIG） */
    config: createDefaultUserConfig(),
    configLoaded: false,
    configSaving: false,
    /** 平博 v4 用 A8 账号，来自 GetUserInfo 或 /api/a8/credit-plate-user */
    creditPlateUserName: "",
    /** restoreSession / 无 token 判定完成后为 true，避免已登录刷新闪登录框 */
    sessionChecked: !getToken(),
    ready: false,
    error: null as string | null,
    hiddenUserName: localStorage.getItem(HIDDEN_NAME_KEY) === "1",
    proxyList: [] as ProxyRow[],
    message: {} as MessageConfig,
    extensionPrefs: createDefaultExtensionPrefs(),
    follow: null as FollowConfig | null,
    extrasLoaded: false,
    isAdmin: false,
    role: "user" as "admin" | "leader" | "user",
    teamId: null as string | null,
  }),

  getters: {
    isLoggedIn: () => Boolean(getToken()),
    isLeader: state => state.role === "leader",
    canAccessAdmin: state => state.isAdmin || state.role === "leader",

    displayName(state): string {
      return state.hiddenUserName ? String(state.userId || "—") : state.userName;
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
        this.role = info.Role || "user";
        this.teamId = info.TeamId || null;
        const cp = info.CreditPlateUserName?.trim();
        if (cp)
          this.creditPlateUserName = cp;
        await this.loadExtras();
        void subscribeUserChannel(this.userId).catch((err) => {
          console.warn("[pubsub] USER channel:", err);
        });
        void ensureBetTargetChannelSubscribed().catch((err) => {
          console.warn("[pubsub] BetTarget channel:", err);
        });
        void ensurePublishChannelSubscribed().catch((err) => {
          console.warn("[pubsub] Publish channel:", err);
        });
        this.ready = true;
        this.error = null;
      }
      catch (e) {
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
        await ensureTokenRefresh();
      }
      try {
        await this.fetchUserInfo();
        return true;
      }
      catch {
        clearAuthSession();
        this.ready = false;
        return false;
      }
      finally {
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
      this.extensionPrefs = createDefaultExtensionPrefs();
      this.follow = null;
      this.extrasLoaded = false;
      this.config = createDefaultUserConfig();
      this.configLoaded = false;
      this.configSaving = false;
      this.isAdmin = false;
      this.role = "user";
      this.teamId = null;
      this.ready = false;
      localStorage.removeItem(USER_KEY);
    },

    async loadExtras(force = false) {
      if (this.extrasLoaded && !force)
        return;
      const proxies = await getClientDataArray<ProxyRow>("PROXY");
      this.proxyList = proxies.filter(p => p?.proxyId != null);
      const msg = await getClientData<MessageConfig>("Message");
      this.message = msg ?? {};
      const ext = await getClientData<ExtensionPrefs>("Extensions");
      this.extensionPrefs = normalizeExtensionPrefs(ext);
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

    async saveExtensionPrefs() {
      const result = await saveClientDataDetailed("Extensions", JSON.stringify(this.extensionPrefs));
      if (!result.ok)
        throw new Error(result.msg || "保存扩展配置失败");
    },

    async deleteProxy(proxyId: number) {
      const { useAccountStore } = await import("@/stores/accountStore");
      const accounts = useAccountStore().accounts;
      const inUse = accounts.some(a => a.proxyId === proxyId);
      if (inUse) {
        throw new Error("当前代理正在被账号使用");
      }
      this.proxyList = this.proxyList.filter(p => p.proxyId !== proxyId);
      await this.saveProxyList();
    },

    toggleHiddenUserName() {
      this.hiddenUserName = !this.hiddenUserName;
      localStorage.setItem(HIDDEN_NAME_KEY, this.hiddenUserName ? "1" : "0");
    },

    async patchSetting(patch: Record<string, unknown>) {
      const next = await apiUpdateUserSetting(patch);
      this.setting = { ...this.setting, ...next };
      return next;
    },

    betTargetEnabled(): boolean {
      return Boolean(this.setting?.BetTarget);
    },

    async loadConfig() {
      const raw = await getClientData<Partial<UserConfig>>(CONFIG_KEY);
      this.config = mergeUserConfig(raw ?? undefined);
      this.configLoaded = true;
    },

    buildConfigSavePayload(): UserConfig {
      const raw = toRaw(this.config) as UserConfig & {
        arbDetectEngine?: unknown;
        arbExecuteEngine?: unknown;
      };
      const {
        arbDetectEngine: _legacyDetectEngine,
        arbExecuteEngine: _legacyExecuteEngine,
        ...configBody
      } = raw;
      return {
        ...configBody,
        betMoney: Number(this.config.betMoney) || 100,
        minMoney: Number(this.config.minMoney) || 0,
        maxMoney: Number(this.config.maxMoney) || 0,
        profit: Number(this.config.profit) || 1.03,
        maxProfit: Number(this.config.maxProfit) || 1.2,
        minOdds: Number(this.config.minOdds) || 1.3,
        maxOdds: Number(this.config.maxOdds) || 10,
        makeProfit: Number(this.config.makeProfit) || 1.01,
        makeUp_odds: Number(this.config.makeUp_odds) || 0,
        makeUp_defaultOdds: Number(this.config.makeUp_defaultOdds) || 0,
        anyOddsProfit: Number(this.config.anyOddsProfit) || 0.95,
        checkTimeout: Number(this.config.checkTimeout) || 3000,
      };
    },

    async saveConfig(): Promise<ConfigSaveResult> {
      this.configSaving = true;
      try {
        const payload = this.buildConfigSavePayload();
        let content: string;
        try {
          content = JSON.stringify(payload);
        }
        catch {
          return { ok: false, msg: "配置无法序列化，请刷新页面后重试" };
        }
        const result = await saveClientDataDetailed(CONFIG_KEY, content);
        if (result.ok) {
          this.config = payload;
        }
        return result;
      }
      finally {
        this.configSaving = false;
      }
    },
  },
});
