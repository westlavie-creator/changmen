/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_API_PROXY?: string;
  /** DEV：Vite 代理 HTTPS 目标时的客户端证书（mTLS） */
  readonly VITE_API_PROXY_TLS_CERT?: string;
  readonly VITE_API_PROXY_TLS_KEY?: string;
  readonly VITE_API_PROXY_TLS_CA?: string;
  readonly VITE_V4_BASE_URL?: string;
  readonly VITE_HK_RELAY_ORIGIN?: string;
  /** @deprecated 使用 VITE_HK_RELAY_ORIGIN */
  readonly VITE_PM_HK_RELAY_ORIGIN?: string;
  /** 仅 DEV：覆盖 Market hub origin。生产走 GetUserInfo.MarketHubOrigin */
  readonly VITE_MARKET_HUB_ORIGIN?: string;
  readonly VITE_V4_PROXY?: string;
  readonly VITE_V4_DIRECT?: string;
  readonly VITE_GAMEBET_EXTENSION_ID?: string;
  /** DEV：1/true/未设=跳过扩展门控；0/false=强制检测 */
  readonly VITE_SKIP_EXTENSION_GATE?: string;
  /** 可选：浏览器侧 Polygon RPC（覆盖 venue-adapter 默认公共节点） */
  readonly VITE_POLYGON_RPC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";

  const component: DefineComponent<object, object, unknown>;
  export default component;
}

declare module "socketcluster-client";
