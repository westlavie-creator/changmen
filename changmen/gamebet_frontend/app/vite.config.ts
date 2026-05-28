import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

const API_TARGET = process.env.VITE_API_PROXY || "http://127.0.0.1:3456";

export default defineConfig({
  base: "/app/",
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/console": { target: API_TARGET, changeOrigin: true },
      "/esport/ws": { target: API_TARGET, changeOrigin: true, ws: true },
      "/esport2": { target: API_TARGET, changeOrigin: true },
      "/esport": { target: API_TARGET, changeOrigin: true },
      "/common": { target: API_TARGET, changeOrigin: true },
      "/api": { target: API_TARGET, changeOrigin: true },
      "/v4.0": { target: API_TARGET, changeOrigin: true },
    },
  },
});
