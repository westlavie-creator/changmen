/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";
import { fileURLToPath, URL } from "node:url";
import { matcherDevRedirect } from "./vite/plugins/matcherDevRedirect";

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

function venueChunkName(id: string): string | undefined {
  const markers = ["client/venue-adapter/"];
  let idx = -1;
  let markerLen = 0;
  for (const marker of markers) {
    const i = id.indexOf(marker);
    if (i !== -1) {
      idx = i;
      markerLen = marker.length;
      break;
    }
  }
  if (idx === -1) return undefined;
  const rest = id.slice(idx + markerLen);
  const dir = rest.split(/[/\\]/)[0];
  if (!dir || dir === "registry" || dir === "contract" || dir === "shared") return undefined;
  // 各 venue adapter 分包互相循环引用，拆成多 chunk 会在浏览器触发 TDZ 白屏
  return "venue-all";
}

export default defineConfig(({ mode }) => ({
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
      "@venue": fileURLToPath(new URL("../venue-adapter", import.meta.url)),
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
    // venue adapters 目前必须合成一个 chunk，拆细会因循环依赖触发浏览器 TDZ 白屏。
    // 阈值按当前最大 chunk（venue-all 约 2.0MB）留少量余量，后续超过该值仍会报警。
    chunkSizeWarningLimit: 2200,
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
    proxy: {
      "/esport2": { target: API_TARGET, changeOrigin: true, ws: true },
      "/esport": { target: API_TARGET, changeOrigin: true, ws: true },
      "/common": { target: API_TARGET, changeOrigin: true, ws: true },
      "/api": { target: API_TARGET, changeOrigin: true, ws: true },
      "/matcher": { target: API_TARGET, changeOrigin: true, ws: true },
      "/health": { target: API_TARGET, changeOrigin: true },
      "/v4.0": { target: API_TARGET, changeOrigin: true, ws: true },
    },
  },
  test: {
    include: [
      "src/**/*.{test,spec}.{js,mjs,ts}",
      "../venue-adapter/**/*.{test,spec}.{js,mjs,ts}",
      "../venue-adapter/**/shared/**/*.{test,spec}.{js,mjs,ts}",
    ],
  },
}));
