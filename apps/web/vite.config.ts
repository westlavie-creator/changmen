/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";
import { fileURLToPath, URL } from "node:url";

// Windows Hyper-V 常保留 3426-3525，本地后端默认 3560；Linux/VPS 仍用 3456
const DEV_API_PORT = process.platform === "win32" ? 3560 : 3456;
const API_TARGET = process.env.VITE_API_PROXY || `http://127.0.0.1:${DEV_API_PORT}`;

function platformChunkName(id: string): string | undefined {
  const marker = "packages/platform-adapter/";
  const idx = id.indexOf(marker);
  if (idx === -1) return undefined;
  const rest = id.slice(idx + marker.length);
  const dir = rest.split(/[/\\]/)[0];
  if (!dir || dir === "registry" || dir === "contract" || dir === "shared") return undefined;
  return `platform-${dir.toLowerCase()}`;
}

export default defineConfig(({ mode }) => ({
  base: "/",
  plugins: [
    vue(),
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
      "@platform": fileURLToPath(new URL("../../packages/platform-adapter", import.meta.url)),
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
    port: 5174,
    proxy: {
      "/esport2": { target: API_TARGET, changeOrigin: true },
      "/esport": { target: API_TARGET, changeOrigin: true },
      "/common": { target: API_TARGET, changeOrigin: true },
      "/api": { target: API_TARGET, changeOrigin: true },
      "/matcher": { target: API_TARGET, changeOrigin: true },
      "/v4.0": { target: API_TARGET, changeOrigin: true },
    },
  },
  test: {
    include: [
      "src/**/*.{test,spec}.{js,mjs,ts}",
      "../../packages/platform-adapter/**/frontend/**/*.{test,spec}.{js,mjs,ts}",
      "../../packages/platform-adapter/**/shared/**/*.{test,spec}.{js,mjs,ts}",
    ],
  },
}));
