import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");

function resolveFromRepo(specifier: string): string {
  try {
    return require.resolve(specifier);
  }
  catch {
    return require.resolve(specifier, { paths: [REPO_ROOT] });
  }
}

/**
 * Vite 6+ 将 Node 内置 `buffer` / `process` 在浏览器侧 externalize 为空壳。
 * `@polymarket/builder-relayer-client` → ethers v5 → bn.js 访问 `buffer.Buffer` 会报：
 * Module "buffer" has been externalized for browser compatibility.
 *
 * 证据：Vite troubleshooting「module-externalized-for-browser-compatibility」；
 * polyfill 使用仓库已有传递依赖 `buffer` / `process`（mqtt 等引入）。
 */
export function browserNodeBuiltins(): Plugin {
  const bufferEntry = resolveFromRepo("buffer/");
  const processBrowser = resolveFromRepo("process/browser.js");

  return {
    name: "changmen-browser-node-builtins",
    config() {
      return {
        resolve: {
          alias: [
            { find: /^buffer$/, replacement: bufferEntry },
            { find: /^process$/, replacement: processBrowser },
          ],
        },
        optimizeDeps: {
          include: [
            "buffer",
            "process",
            "@polymarket/builder-relayer-client",
          ],
          esbuildOptions: {
            define: {
              global: "globalThis",
            },
          },
        },
        define: {
          global: "globalThis",
        },
        build: {
          commonjsOptions: {
            transformMixedEsModules: true,
          },
        },
      };
    },
  };
}
