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

function platformChunkName(id: string): string | undefined {
  const markers = ["client/platform-adapter/"];
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
  // 各 platform-* 分包互相循环引用，拆成多 chunk 会在浏览器触发 TDZ 白屏
  return "platform-all";
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
      "@platform": fileURLToPath(new URL("../platform-adapter", import.meta.url)),
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          const platformChunk = platformChunkName(id);
          if (platformChunk) return platformChunk;

          if (!id.includes("node_modules")) return undefined;

          if (id.includes("element-plus")) return "vendor-element-plus";
          if (id.includes("mqtt")) return "vendor-mqtt";
          if (id.includes("socket.io-client")) return "vendor-socketio";
          if (id.includes("socketcluster-client")) return "vendor-socketcluster";
          if (id.includes("tronweb")) return "vendor-tronweb";
          if (id.includes("goeasy")) return "vendor-goeasy";
          if (
            id.includes("/vue/") ||
            id.includes("/vue-router/") ||
            id.includes("/pinia/") ||
            id.includes("\\vue\\") ||
            id.includes("\\vue-router\\") ||
            id.includes("\\pinia\\")
          ) {
            return "vendor-vue";
          }
          if (id.includes("@vueuse")) return "vendor-vueuse";
          return "vendor";
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
      "/v4.0": { target: API_TARGET, changeOrigin: true, ws: true },
    },
  },
  test: {
    include: [
      "src/**/*.{test,spec}.{js,mjs,ts}",
      "../platform-adapter/**/*.{test,spec}.{js,mjs,ts}",
      "../platform-adapter/**/shared/**/*.{test,spec}.{js,mjs,ts}",
    ],
  },
}));
