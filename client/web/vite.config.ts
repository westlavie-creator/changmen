/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { matcherDevRedirect } from "./vite/plugins/matcherDevRedirect";
import {
  VENUE_ADAPTER_REL,
  VENUE_ADAPTER_ROOT,
} from "../../server/storage/paths.js";

const WEB_ROOT = fileURLToPath(new URL(".", import.meta.url));
const CLIENT_CORE_SRC = path.resolve(WEB_ROOT, "../../packages/client-core/src");
const venueAdapterVitestGlob = path
  .relative(WEB_ROOT, VENUE_ADAPTER_ROOT)
  .split(path.sep)
  .join("/");
const clientCoreVitestGlob = path
  .relative(WEB_ROOT, path.resolve(WEB_ROOT, "../../packages/client-core"))
  .split(path.sep)
  .join("/");

// Windows Hyper-V 常保留 3426-3525，本地后端默认 3560；Linux/VPS 仍用 3456
const DEV_API_PORT = process.platform === "win32" ? 3560 : 3456;
const API_TARGET = process.env.VITE_API_PROXY || `http://127.0.0.1:${DEV_API_PORT}`;
// Hyper-V/WSL 常保留 5123-5222（含 Vite 默认 5173/5174）
const DEFAULT_DEV_PORT = process.platform === "win32" ? 5274 : 5174;
const DEV_PORT = Number(process.env.VITE_DEV_PORT) || DEFAULT_DEV_PORT;
const INTENTIONAL_MIXED_IMPORTS = [
  "/src/api/chat.ts",
  "/src/runtime/collectors.ts",
  "/src/stores/account/balanceRefresh.ts",
  "/src/stores/accountStore.ts",
  "/src/stores/loseOrderStore.ts",
  "/src/stores/messageStore.ts",
  "/src/stores/userStore.ts",
];

function sharedVenueChunk(id: string): string | undefined {
  // client-core / monorepo shared 被各 venue 共用
  if (
    id.includes("packages/arb-core")
    || id.includes("@changmen/arb-core")
    || id.includes("packages/client-core")
    || id.includes("@changmen/client-core")
    || id.includes("packages/shared")
    || id.includes("@changmen/shared")
    || id.includes("packages/api-contract")
    || id.includes("@changmen/api-contract")
  ) {
    return "venue-shared";
  }
  // socket.io 同时被 venue-shared/socket 与各平台 WS 使用；落到单一平台 chunk 会与
  // venue-shared 形成循环依赖（Cannot access 'O' before initialization 白屏）。
  if (
    id.includes("node_modules/socket.io-client")
    || id.includes("node_modules/engine.io-client")
    || id.includes("node_modules/socket.io-parser")
  ) {
    return "venue-shared";
  }
  return undefined;
}

function venueChunkName(id: string): string | undefined {
  const marker = `${VENUE_ADAPTER_REL.replace(/\\/g, "/")}/`;
  const idx = id.replace(/\\/g, "/").indexOf(marker);
  if (idx === -1)
    return undefined;
  const rest = id.slice(idx + marker.length);
  const dir = rest.split(/[/\\]/)[0];
  if (!dir || dir === "registry" || dir === "adaptation") return undefined;
  if (dir === "shared" || dir === "contract") return "venue-shared";
  return `venue-${dir}`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), "");
  const hkRelayTarget = String(env.VITE_HK_RELAY_ORIGIN || env.VITE_PM_HK_RELAY_ORIGIN || "").trim().replace(/\/+$/, "");

  const proxy: Record<string, { target: string; changeOrigin: boolean; ws?: boolean }> = {};
  if (hkRelayTarget) {
    // 场馆 HK 出海 relay：dev 同源走 Vite 代理到香港 VPS，避免浏览器跨域 OPTIONS 到 3560 / 外网 IP
    proxy["/esport/http-relay"] = { target: hkRelayTarget, changeOrigin: true };
    proxy["/esport/ws-forward/PM-MARKET"] = { target: hkRelayTarget, changeOrigin: true, ws: true };
    proxy["/esport/ws-forward/PM-USER"] = { target: hkRelayTarget, changeOrigin: true, ws: true };
    proxy["/esport/ws-forward/PREDICTFUN-MARKET"] = { target: hkRelayTarget, changeOrigin: true, ws: true };
  }
  proxy["/esport2"] = { target: API_TARGET, changeOrigin: true, ws: true };
  proxy["/esport"] = { target: API_TARGET, changeOrigin: true, ws: true };
  proxy["/common"] = { target: API_TARGET, changeOrigin: true, ws: true };
  proxy["/api"] = { target: API_TARGET, changeOrigin: true, ws: true };
  proxy["/matcher"] = { target: API_TARGET, changeOrigin: true, ws: true };
  proxy["/health"] = { target: API_TARGET, changeOrigin: true };
  proxy["/v4.0"] = { target: API_TARGET, changeOrigin: true, ws: true };

  return {
  base: "/",
  plugins: [
    vue(),
    matcherDevRedirect(),
    mode === "analyze"
      ? visualizer({
          filename: "dist/stats.html",
          gzipSize: true,
          brotliSize: true,
          open: false,
        })
      : undefined,
  ],
  resolve: {
    // platform_adapter 同目录常有 .ts（Vite）与 .js（Node CJS）并存，须优先 .ts
    extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@changmen/client-core": CLIENT_CORE_SRC,
      "@changmen/venue-adapter": VENUE_ADAPTER_ROOT,
      mqtt: fileURLToPath(new URL("../../node_modules/mqtt", import.meta.url)),
      "socket.io-client": fileURLToPath(
        new URL("../../node_modules/socket.io-client", import.meta.url),
      ),
      "socketcluster-client": fileURLToPath(
        new URL("../../node_modules/socketcluster-client", import.meta.url),
      ),
    },
  },
  build: {
    // venue adapters 按平台目录分包；shared/registry/contract 留在主包。
    // 阈值按当前最大单平台 chunk 留余量。
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      onwarn(warning, warn) {
        const message = warning.message ?? "";
        if (
          message.includes("node_modules/element-plus/node_modules/@vueuse/core/dist/index.js")
          && message.includes("contains an annotation that Rollup cannot interpret")
        ) {
          return;
        }
        const isIntentionalMixedImport = INTENTIONAL_MIXED_IMPORTS.some((file) =>
          message.includes(file),
        );
        if (
          isIntentionalMixedImport
          && message.includes("is dynamically imported by")
          && message.includes("but also statically imported by")
        ) {
          return;
        }
        warn(warning);
      },
      output: {
        manualChunks(id) {
          const shared = sharedVenueChunk(id);
          if (shared) return shared;
          const venueChunk = venueChunkName(id);
          if (venueChunk) return venueChunk;
          // 让 Rollup 自行处理 node_modules 分块；手动 vendor 拆包会和
          // platform-all 形成循环 chunk，在浏览器里触发 TDZ 白屏。
          return undefined;
        },
      },
    },
  },
  server: {
    port: DEV_PORT,
    proxy,
  },
  test: {
    setupFiles: ["src/test/vitestSetupCore.ts"],
    include: [
      "src/**/*.{test,spec}.{js,mjs,ts}",
      `${venueAdapterVitestGlob}/**/*.{test,spec}.{js,mjs,ts}`,
      `${venueAdapterVitestGlob}/**/shared/**/*.{test,spec}.{js,mjs,ts}`,
      `${clientCoreVitestGlob}/src/**/*.{test,spec}.{js,mjs,ts}`,
    ],
  },
  };
});
