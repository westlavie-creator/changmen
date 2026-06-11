/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

const API_TARGET = process.env.VITE_API_PROXY || "http://127.0.0.1:3456";

export default defineConfig({
  base: "/",
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@platform": fileURLToPath(new URL("../platform_adapter", import.meta.url)),
      mqtt: fileURLToPath(new URL("./node_modules/mqtt", import.meta.url)),
      "socket.io-client": fileURLToPath(
        new URL("./node_modules/socket.io-client", import.meta.url),
      ),
      "socketcluster-client": fileURLToPath(
        new URL("./node_modules/socketcluster-client", import.meta.url),
      ),
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/console": { target: API_TARGET, changeOrigin: true },
      "/esport/ws": { target: API_TARGET, changeOrigin: true, ws: true, secure: false },
      "/esport2": { target: API_TARGET, changeOrigin: true },
      "/esport": { target: API_TARGET, changeOrigin: true },
      "/common": { target: API_TARGET, changeOrigin: true },
      "/api": { target: API_TARGET, changeOrigin: true },
      "/v4.0": { target: API_TARGET, changeOrigin: true },
    },
  },
  test: {
    include: [
      "src/**/*.{test,spec}.{js,mjs,ts}",
      "../platform_adapter/**/frontend/**/*.{test,spec}.{js,mjs,ts}",
    ],
  },
});
