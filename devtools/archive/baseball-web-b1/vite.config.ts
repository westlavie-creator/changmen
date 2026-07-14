import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const DEV_PORT = Number(process.env.BASEBALL_PORT || 3458);

export default defineConfig({
  base: "/baseball/",
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: DEV_PORT,
    proxy: {
      "/gamma": {
        target: "https://gamma-api.polymarket.com",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/gamma/, ""),
      },
      "/clob": {
        target: "https://clob.polymarket.com",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/clob/, ""),
      },
    },
  },
});
