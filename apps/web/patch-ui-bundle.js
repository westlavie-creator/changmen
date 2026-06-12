#!/usr/bin/env node
"use strict";

/**
 * 将 vendor/ui-bundle 转为本地可运行的 console 前端（旧版 /console/）。
 *
 * 阶段 7 起默认不再在 preweb 中执行；需要旧控制台时：
 *   npm run patch:ui
 *   或 PATCH_CONSOLE=1 npm run web
 *
 * 原则：行为与参考 bundle 一致，仅将 HTTP API 指到本地后端；WS 仍直连 A8 聚合机（与 A8 一致）。
 * 不在此脚本中改启动顺序、路由守卫、采集逻辑等业务行为。
 */

const fs = require("fs");
const path = require("path");
const { A8_USER, A8_PASSWORD } = require(path.join(
  __dirname,
  "..",
  "backend",
  "core",
  "integrations",
  "a8",
  "constants.js",
));

const FRONTEND_ROOT = __dirname;
const SOURCE = process.env.UI_BUNDLE_SOURCE
  || path.join(FRONTEND_ROOT, "vendor", "ui-bundle", "index.js");
const OUT_DIR = process.env.UI_BUNDLE_OUT
  || path.join(FRONTEND_ROOT, "console");
const OUT_FILE = path.join(OUT_DIR, "index.js");
/** 可选：ENABLE_PB_NODE=1 时禁用浏览器 bQ，PB HTTP 走 /esport/pb/proxy（默认仍用插件 Yn + bQ） */
const PB_NODE_MODE = process.env.ENABLE_PB_NODE === "1";

function patch(source) {
  let out = source.replace(/\r\n/g, "\n");

  // --- 聚合 HTTP API → 本地 ---
  const pairs = [
    [
      '/debug/.test(location.search) ? "//localhost:5000/esport/" : "https://api.a8.to/esport/"',
      'location.origin + "/esport/"',
    ],
    ["https://api.a8.to/esport/", "/esport/"],
    ["https://api.a8.to/esport2/", "/esport2/"],
    ["https://api.a8.to/common/", "/common/"],
    ["https://api.a8.to/esport-ahao/", "/esport-ahao/"],
    ["https://api.a8.to/v4.0/", "/v4.0/"],
    ["https://api.a8.to/IP/Address", "/IP/Address"],
    ["https://api.a8.to/IP", "/IP"],
  ];

  for (const [from, to] of pairs) {
    out = out.split(from).join(to);
  }

  // UserCollectView 平博 v4：localhost 保留浏览器直连 A8（与 vendor 官方一致，避免 /v4.0 代理被 CF 403）
  out = out.replace(
    /location\.hostname\s*===\s*"localhost"\s*&&\s*\(\s*p\s*=\s*"\/v4\.0\/"\s*\)/g,
    'location.hostname==="localhost"&&(p="https://api.a8.to/v4.0/")',
  );

  // 参考 bundle 压缩 typo，不修复则无法解析
  out = out.replace(/einstanceof Date/g, "e instanceof Date");

  // 对齐 A8：登录页预填写死 A8 账号（见 shared/a8_constants.js）
  out = out.replace(
    'userName: localStorage.getItem(vK) || ""',
    `userName: localStorage.getItem(vK) || "${A8_USER}"`,
  );
  out = out.replace(
    `userName: localStorage.getItem(vK) || "${A8_USER}",
                password: ""`,
    `userName: localStorage.getItem(vK) || "${A8_USER}",
                password: "${A8_PASSWORD}"`,
  );

  // 本地开发：允许通过 localStorage.EXT_ID 覆盖插件 ID（原版写死 AF）
  out = out.replace(
    "chrome.runtime.sendMessage(AF, e, {}, s => {",
    'chrome.runtime.sendMessage(localStorage.getItem("EXT_ID")||AF, e, {}, s => {',
  );

  out = patchObMqttOdds(out);
  out = patchPluginBootSkip(out);

  if (PB_NODE_MODE) {
    out = patchPbNodeMode(out);
  }

  return out;
}

/** 插件检测：最多等待 3s，超时后自动挂载 Vue（本地无扩展时不必卡 30s） */
function patchPluginBootSkip(out) {
  const old = `      , YQe = async () => {
        const t = await Nr.get(\`/esport2/assets/version.json?\${Date.now()}\`)
          , e = t.data.version;
        for (let r = 0; r < 10; r++) {
            const n = await Yn.init();
            if (n) {
                const s = \`\${n.name} \${n.version}\`;
                document.body.classList.remove("checking"),
                no({
                    message: s,
                    type: "success",
                    dangerouslyUseHTMLString: !0,
                    duration: 5 * 1e3
                }),
                document.title = s,
                n.error ? Lc.alert(\`\${n.error}<br /><a href="esport-extensions.zip">点击下载最新版本</a>\`, "插件发生错误", {
                    type: "error",
                    showConfirmButton: !1,
                    dangerouslyUseHTMLString: !0,
                    draggable: !0
                }) : (gB.use(W8e).use(NMe).use(bQe).use(NBe).use(CQe).use(U2).use(bQ).use(Eee).use(SQ).use(KQe).use(EZe).use(PQ).use(yZe),
                gB.mount("#app"));
                break
            }
            qQe(e),
            await pt.wait(3e3)
        }
    }`;
  const neu = `      , YQe = async () => {
        const t = await Nr.get(\`/esport2/assets/version.json?\${Date.now()}\`)
          , e = t.data.version
          , r = Date.now() + 3e3
          , mountVue = () => {
            gB.use(W8e).use(NMe).use(bQe).use(NBe).use(CQe).use(U2).use(bQ).use(Eee).use(SQ).use(KQe).use(EZe).use(PQ).use(yZe),
            gB.mount("#app")
        };
        for (; Date.now() < r; ) {
            const n = await Yn.init();
            if (n) {
                const s = \`\${n.name} \${n.version}\`;
                document.body.classList.remove("checking"),
                no({
                    message: s,
                    type: "success",
                    dangerouslyUseHTMLString: !0,
                    duration: 5 * 1e3
                }),
                document.title = s,
                n.error ? Lc.alert(\`\${n.error}<br /><a href="esport-extensions.zip">点击下载最新版本</a>\`, "插件发生错误", {
                    type: "error",
                    showConfirmButton: !1,
                    dangerouslyUseHTMLString: !0,
                    draggable: !0
                }) : mountVue();
                return
            }
            qQe(e),
            await pt.wait(200)
        }
        document.body.classList.remove("checking"),
        mountVue()
    }`;
  if (!out.includes(old)) {
    console.warn("patch-ui-bundle: plugin boot loop not found — skip patch skipped");
    return out;
  }
  return out.replace(old, neu);
}

/** OB MQTT：id/odd 与 HTTP game/view 对齐，避免 isOdds 因类型或精度匹配失败 */
function patchObMqttOdds(out) {
  const mqttOld = `                case "/market/oddsUpdate/":
                    f.forEach(h => {
                        o.isOdds(s, h.id) && o.save(s, new Jn(h.id,h.odd,!1,h.market_id))
                    }
                    );
                    break;
                case "/market/statusUpdate/":
                    f.forEach(h => {
                        o.updateBetLock(s, h.market_id, !0)
                    }
                    );
                    break;
                case "/market/suspended/":
                    f.forEach(h => {
                        o.updateBetLock(s, h.market_id, h.suspended === 1)
                    }
                    );
                    break`;
  const mqttNew = `                case "/market/oddsUpdate/":
                    f.forEach(h => {
                        const y = String(h.id)
                          , v = String(h.odd ?? "").toNumber();
                        o.isOdds(s, y) && o.save(s, new Jn(y,v,!1,String(h.market_id)))
                    }
                    );
                    break;
                case "/market/statusUpdate/":
                    f.forEach(h => {
                        o.updateBetLock(s, String(h.market_id), !0)
                    }
                    );
                    break;
                case "/market/suspended/":
                    f.forEach(h => {
                        o.updateBetLock(s, String(h.market_id), h.suspended === 1)
                    }
                    );
                    break`;
  if (!out.includes(mqttOld)) {
    console.warn("patch-ui-bundle: OB MQTT odds block not found — patch skipped");
    return out;
  }
  out = out.replace(mqttOld, mqttNew);

  const httpOld = "o.save(s, new Jn(P.id,P.odd.toNumber(),A,b.id))";
  const httpNew = "o.save(s, new Jn(String(P.id),P.odd.toNumber(),A,String(b.id)))";
  if (!out.includes(httpOld)) {
    console.warn("patch-ui-bundle: OB HTTP fo.save line not found — patch skipped");
  } else {
    out = out.replace(httpOld, httpNew);
  }

  return out;
}

function patchPbNodeMode(out) {
  // 阶段 1（可选 ENABLE_PB_NODE=1）：禁用浏览器 bQ；需同时 ESPORT_BRIDGE=1 才有 store 数据
  out = out.replace(".use(U2).use(bQ).use(Eee)", ".use(U2).use(Eee)");

  // 阶段 2：PB API 走本地 /esport/pb/proxy，替代 chrome 插件 Yn
  const ynGetOld = `        static async get(e, r) {
            const n = await this.sendMessage({
                type: "GET",
                url: e,
                options: r
            });
            return n == null ? void 0 : n.response
        }`;
  const ynGetNew = `        static async get(e, r) {
            if (/\\/(sports-service|member-service|member-betslip|bet-placement)\\//i.test(e)) {
                const o = r?.headers || {}
                  , a = await fetch("/esport/pb/proxy?url=" + encodeURIComponent(e), {
                    method: "GET",
                    headers: o
                })
                  , i = await a.text();
                let l = null;
                try {
                    l = i ? JSON.parse(i) : null
                } catch {
                    l = i
                }
                return {
                    data: l,
                    status: a.status,
                    statusText: a.statusText,
                    headers: {},
                    config: {},
                    request: {}
                }
            }
            const n = await this.sendMessage({
                type: "GET",
                url: e,
                options: r
            });
            return n == null ? void 0 : n.response
        }`;
  if (!out.includes(ynGetOld)) {
    console.warn("patch-ui-bundle: Yn.get block not found — PB proxy patch skipped");
  } else {
    out = out.replace(ynGetOld, ynGetNew);
  }

  const ynPostOld = `        static async post(e, r, n) {
            const s = await this.sendMessage({
                type: "POST",
                url: e,
                data: r,
                options: n
            });
            return s == null ? void 0 : s.response
        }`;
  const ynPostNew = `        static async post(e, r, n) {
            if (/\\/(sports-service|member-service|member-betslip|bet-placement)\\//i.test(e)) {
                const o = {
                    ...(n?.headers || {})
                }
                  , a = r == null || r === "" ? void 0 : typeof r == "string" ? r : (() => {
                    const c = (o["content-type"] || o["Content-Type"] || "").toLowerCase();
                    return c.includes("application/x-www-form-urlencoded") ? new URLSearchParams(r).toString() : JSON.stringify(r)
                })();
                a && !o["content-type"] && !o["Content-Type"] && (o["Content-Type"] = "application/json");
                const i = await fetch("/esport/pb/proxy?url=" + encodeURIComponent(e), {
                    method: "POST",
                    headers: o,
                    body: a
                })
                  , l = await i.text();
                let u = null;
                try {
                    u = l ? JSON.parse(l) : null
                } catch {
                    u = l
                }
                return {
                    data: u,
                    status: i.status,
                    statusText: i.statusText,
                    headers: {},
                    config: {},
                    request: {}
                }
            }
            const s = await this.sendMessage({
                type: "POST",
                url: e,
                data: r,
                options: n
            });
            return s == null ? void 0 : s.response
        }`;
  if (!out.includes(ynPostOld)) {
    console.warn("patch-ui-bundle: Yn.post block not found — PB proxy patch skipped");
  } else {
    out = out.replace(ynPostOld, ynPostNew);
  }

  return out;
}

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`UI bundle source not found: ${SOURCE}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const raw = fs.readFileSync(SOURCE, "utf8");
  const patched = patch(raw);
  fs.writeFileSync(OUT_FILE, patched, "utf8");
  console.log(`Patched UI bundle → ${OUT_FILE} (${(patched.length / 1024 / 1024).toFixed(2)} MB)`);
}

main();
