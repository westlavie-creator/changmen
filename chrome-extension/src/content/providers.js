import { PLATFORMS } from "./platforms.js";
import { getCookie, sleep } from "./utils.js";
import { getPolymarketCredentials } from "./polymarket/init.js";

const IM_PATH =
  /^\/(esportsitev2|esportmobilev2)\/index.html\?v=\d+&id=\d+&token=([^\&]+)/;
const IA_SEARCH = /^\?lang=\d&token=([\w\.\_\-]+)$/;

/** PB / ps3838：x-app-data 有 BrowserSessionId(_N)? + custid(_N)?，或顶层 token 含会话头 */
function hasPbLoginSession() {
  const appRaw = localStorage.getItem("x-app-data");
  if (appRaw) {
    try {
      const app = JSON.parse(appRaw);
      const keys = Object.keys(app || {});
      const hasSession = keys.some(
        (k) => k === "BrowserSessionId" || /^BrowserSessionId_\d+$/.test(k),
      );
      const hasCustid = keys.some((k) => k === "custid" || /^custid_\d+$/.test(k));
      if (hasSession && hasCustid) return true;
    } catch {
      /* fall through */
    }
  }
  try {
    const token = JSON.parse(localStorage.getItem("token") || "");
    if (
      token &&
      typeof token === "object" &&
      (token["X-Browser-Session-Id"] || token["X-Custid"])
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** @type {Record<string, new () => { Check(): Promise<boolean>; GetConfig(): Promise<object|undefined> }>} */
export const PROVIDER_REGISTRY = {
  [PLATFORMS.OB]: class ObProvider {
    async Check() {
      const url = new URL(location.href);
      const token = url.searchParams.get("token");
      const addr = url.searchParams.get("addr");
      if (!token || !/\d+/.test(token)) return false;
      if (!addr) return false;
      try {
        const parsed = JSON.parse(window.atob(addr));
        return Array.isArray(parsed.api);
      } catch {
        return false;
      }
    }

    async GetConfig() {
      const url = new URL(location.href);
      const token = url.searchParams.get("token");
      const addr = url.searchParams.get("addr");
      const parsed = JSON.parse(window.atob(addr));
      const referer = `https://${location.host}/`;
      return {
        provider: PLATFORMS.OB,
        gateway: parsed.api[0],
        token,
        referer,
        data: window.btoa(
          JSON.stringify({
            provider: PLATFORMS.OB,
            gateway: parsed.api,
            token,
            referer,
          }),
        ),
      };
    }
  },

  [PLATFORMS.RAY]: class RayProvider {
    async Check() {
      return Boolean(
        document.body.querySelector(".app-header img[alt=RAYBET]") ??
          document.body.querySelector(".app-header .logo-icon"),
      );
    }

    async GetConfig() {
      let token =
        localStorage.getItem("gameAuthToken") || localStorage.getItem("socketCluster.authToken");
      const userToken = localStorage.getItem("userToken");
      if (!token && userToken && /^\{/.test(userToken)) {
        try {
          token = JSON.parse(userToken).JWT;
        } catch {
          return undefined;
        }
      }
      if (!token) return undefined;

      const res = await fetch("https://api.365raylinks.com/configv4?platform=1");
      const json = await res.json();
      const gateway = json.data.game_api.map((u) => {
        const parsed = new URL(u);
        return `${parsed.protocol}//${parsed.host}`;
      });
      const referer = location.href;
      const bearer = `Bearer ${token}`;
      return {
        provider: PLATFORMS.RAY,
        gateway: gateway[0],
        token: bearer,
        referer,
        data: btoa(
          JSON.stringify({
            provider: PLATFORMS.RAY,
            gateway,
            token: bearer,
            referer,
          }),
        ),
      };
    }
  },

  [PLATFORMS.IM]: class ImProvider {
    async Check() {
      return IM_PATH.test(location.pathname + location.search);
    }

    async GetConfig() {
      const match = IM_PATH.exec(location.pathname + location.search);
      if (!match) return undefined;
      const token = match[2];
      const referer = `${location.protocol}//${location.host}${location.pathname}${location.search}`;
      const gateway = `${location.protocol}//${location.host}`;
      return {
        provider: PLATFORMS.IM,
        gateway,
        token,
        referer,
        data: btoa(
          JSON.stringify({
            provider: PLATFORMS.IM,
            gateway: [gateway],
            token,
            referer,
          }),
        ),
      };
    }
  },

  [PLATFORMS.TF]: class TfProvider {
    async Check() {
      if (!/^gc\./.test(location.host)) return false;
      const vuex = localStorage.getItem("vuex");
      return Boolean(vuex && /^\{/.test(vuex));
    }

    async GetConfig() {
      const vuex = JSON.parse(localStorage.getItem("vuex") ?? "{}");
      const token = vuex?.settings?.settings?.token;
      const priBaseUrl = vuex?.settings?.settings?.priBaseUrl;
      if (!token || !priBaseUrl) return undefined;
      const parsed = new URL(priBaseUrl);
      const gateway = `${parsed.protocol}//${parsed.host}`;
      const referer = `${location.protocol}//${location.host}/`;
      const auth = `Token ${token}`;
      return {
        provider: PLATFORMS.TF,
        gateway,
        token: auth,
        referer,
        data: btoa(
          JSON.stringify({
            provider: PLATFORMS.TF,
            gateway: [gateway],
            token: auth,
            referer,
          }),
        ),
      };
    }
  },

  [PLATFORMS.IA]: class IaProvider {
    async Check() {
      return IA_SEARCH.test(location.search);
    }

    async GetConfig() {
      const match = IA_SEARCH.exec(location.search);
      if (!match) return undefined;
      const token = match[1];
      const gateway = `https://${location.host}`;
      return {
        provider: PLATFORMS.IA,
        gateway,
        token,
        referer: location.href,
        data: btoa(
          JSON.stringify({
            provider: PLATFORMS.IA,
            gateway: [gateway],
            token,
            referer: location.href,
          }),
        ),
      };
    }
  },

  [PLATFORMS.SABA]: class SabaProvider {
    async Check() {
      return /^\/\(S\(ESport/.test(location.pathname);
    }

    async GetConfig() {
      const match = /^\/(.+?)\//.exec(location.pathname);
      if (!match) return undefined;
      const gateway = `${location.protocol}//${location.host}`;
      const referer = `${location.protocol}//${location.host}/`;
      const token = match[1];
      return {
        provider: PLATFORMS.SABA,
        gateway,
        token,
        referer,
        data: btoa(
          JSON.stringify({
            provider: PLATFORMS.SABA,
            gateway: [gateway],
            token,
            referer,
          }),
        ),
      };
    }
  },

  [PLATFORMS.PB]: class PbProvider {
    /**
     * 旧平博电竞：`/esports-hub/`、`/compact/sports/`
     * ps3838 等复刻站：`/{lang}/sports/...`，登录后 x-app-data 为无后缀
     * `BrowserSessionId` / `custid`，且顶层 `token` 含 `X-Browser-Session-Id` / `X-Custid`
     */
    async Check() {
      const path = location.pathname;
      const pathOk = /\/esports\-hub\/|\/compact\/sports\/|\/sports(\/|$)/.test(path);
      if (!pathOk) return false;
      return hasPbLoginSession();
    }

    async GetConfig() {
      if (!(await this.Check())) return undefined;
      const snapshot = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) snapshot[key] = localStorage.getItem(key) ?? "";
      }
      const payload = {
        provider: PLATFORMS.PB,
        gateway: `https://${location.host}`,
        token: JSON.stringify(snapshot),
        referer: location.href,
      };
      return {
        provider: PLATFORMS.PB,
        gateway: payload.gateway,
        token: payload.token,
        referer: payload.referer,
        data: window.btoa(unescape(encodeURIComponent(JSON.stringify(payload)))),
      };
    }
  },

  [PLATFORMS.IMT]: class ImtProvider {
    async Check() {
      return Boolean(localStorage.getItem("siteProfile4") && localStorage.getItem("version4"));
    }

    async GetConfig() {
      const version = localStorage.getItem("version4");
      const profileRaw = localStorage.getItem("siteProfile4");
      if (!version || !profileRaw) return undefined;
      const profile = JSON.parse(profileRaw);
      const token = btoa(JSON.stringify({ tk: profile.t, v: version, mc: profile.mc }));
      const gateway = `${location.protocol}//${location.host}`;
      const referer = `${location.protocol}//${location.host}/`;
      return {
        provider: PLATFORMS.IMT,
        gateway,
        token,
        referer,
        data: btoa(
          JSON.stringify({
            provider: PLATFORMS.IMT,
            gateway: [gateway],
            token,
            referer,
          }),
        ),
      };
    }
  },

  [PLATFORMS.HGA]: class HgaProvider {
    async Check() {
      const ok = document.getElementById("mu_profile") !== null;
      if (ok) {
        void (async () => {
          await sleep(1000);
          const icon = document.body.querySelector(".gamebet-collect-float");
          icon?.setAttribute(
            "onmouseover",
            "this.setAttribute('uid',window.uid);this.setAttribute('ver',window.ver);this.setAttribute('username',window.username);",
          );
        })();
      }
      return ok;
    }

    async GetConfig() {
      const icon = document.body.querySelector(".gamebet-collect-float");
      const uid = icon?.getAttribute("uid") ?? "";
      const ver = icon?.getAttribute("ver") ?? "";
      const username = icon?.getAttribute("username") ?? "";
      const gateway = `https://${location.host}`;
      const token = JSON.stringify({ uid, ver, username });
      const referer = location.href;
      return {
        provider: PLATFORMS.HGA,
        token,
        gateway,
        referer,
        data: btoa(
          JSON.stringify({
            provider: PLATFORMS.HGA,
            token,
            gateway: [gateway],
            referer,
          }),
        ),
        _hgaMeta: { gateway, uid, ver, username },
      };
    }
  },

  [PLATFORMS.HG]: class HgProvider {
    async Check() {
      const ok =
        document.getElementById("header_currency") !== null &&
        document.getElementById("header_credit") !== null;
      if (ok) {
        void (async () => {
          await sleep(1000);
          const icon = document.body.querySelector(".gamebet-collect-float");
          icon?.setAttribute(
            "onmouseover",
            "this.setAttribute('userdata',JSON.stringify(window.userData));",
          );
        })();
      }
      return ok;
    }

    async GetConfig() {
      const icon = document.body.querySelector(".gamebet-collect-float");
      const userdata = icon?.getAttribute("userdata") ?? "";
      if (!userdata) return undefined;
      const parsed = JSON.parse(userdata);
      const token = JSON.stringify({
        uid: parsed.uid,
        ver: parsed.ver,
        username: parsed.username,
      });
      const gateway = `https://${location.host}`;
      const referer = location.href;
      return {
        provider: PLATFORMS.HG,
        gateway,
        token,
        referer,
        data: btoa(
          JSON.stringify({
            provider: PLATFORMS.HG,
            token,
            gateway: [gateway],
            referer,
          }),
        ),
      };
    }
  },

  [PLATFORMS.Stake]: class StakeProvider {
    async Check() {
      return location.hostname === "stake.com";
    }

    async GetConfig() {
      const session = getCookie("session");
      if (!session) return undefined;
      const payload = {
        provider: PLATFORMS.Stake,
        gateway: `https://${location.host}`,
        token: session,
        referer: location.href,
      };
      return { ...payload, data: btoa(JSON.stringify(payload)) };
    }
  },

  [PLATFORMS.Dex]: class DexProvider {
    async Check() {
      return location.hostname.includes("dexsport");
    }

    async GetConfig() {
      const el = document.documentElement;
      const hash = el.dataset.dexHash;
      if (!hash) return undefined;
      const jwt = el.dataset.dexAccessToken || "";
      const network = localStorage.getItem("main_network_name") || "";
      const currency = localStorage.getItem("main_currency_contract") || "";
      const sportsbookToken = `${hash}_${network}_${currency}_sportsbook`;
      const gateway = "https://prod.dexsport.work";
      const payload = {
        provider: PLATFORMS.Dex,
        gateway,
        token: sportsbookToken,
        hash,
        jwt,
        network,
        currency,
        referer: location.href,
      };
      return { ...payload, data: btoa(JSON.stringify(payload)) };
    }
  },

  [PLATFORMS.Polymarket]: class PolymarketProvider {
    async Check() {
      return location.hostname === "polymarket.com" || location.hostname.endsWith(".polymarket.com");
    }

    async GetConfig() {
      const credentials = getPolymarketCredentials();
      return credentials?.token ? credentials : undefined;
    }
  },
};

export function createProvider(platformId) {
  const Cls = PROVIDER_REGISTRY[platformId];
  return Cls ? new Cls() : null;
}
