/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_API_PROXY?: string;
  readonly VITE_V4_BASE_URL?: string;
  readonly VITE_V4_PROXY?: string;
  readonly VITE_V4_DIRECT?: string;
  readonly VITE_GAMEBET_EXTENSION_ID?: string;
  /** DEV：1/true/未设=跳过扩展门控；0/false=强制检测 */
  readonly VITE_SKIP_EXTENSION_GATE?: string;
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
