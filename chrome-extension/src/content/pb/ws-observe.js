/**
 * part888 sports-websocket 观测客户端（Step1）。
 * [changmen 扩展] 旁路：默认不启用；只转发/落盘帧，不写 oddsStore / SaveMatch。
 * 协议见 client/web/docs/platforms/PB_WS.md
 */

const WS_PATH = "/sports-websocket/ws";
const STORAGE_STATUS_KEY = "pbWsObserve";
const MAX_RECENT = 40;
const MAX_RAW_CHARS = 6000;

/**
 * bundle：`enableUseMemberAuthEndpoints` → `member-auth/v2`，否则 `member-service/v2`
 * @returns {string[]}
 */
function swstokenPathCandidates() {
  // content script 读不到页面 window.env；part888/ps3838 线上走 member-auth
  if (/part888|ps3838/i.test(location.hostname)) {
    return ["/member-auth/v2/swstoken", "/member-service/v2/swstoken"];
  }
  const env = (typeof window !== "undefined" && window.env) || {};
  const authFirst = Boolean(env.enableUseMemberAuthEndpoints);
  const auth = "/member-auth/v2/swstoken";
  const member = "/member-service/v2/swstoken";
  return authFirst ? [auth, member] : [member, auth];
}

/**
 * @returns {Record<string, unknown>}
 */
function readXAppData() {
  try {
    const raw = localStorage.getItem("x-app-data");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

/**
 * 对齐官网 member 请求头（cookie + x-app-data + 内层 X-*）
 * @returns {Record<string, string>}
 */
function buildPageAuthHeaders() {
  /** @type {Record<string, string>} */
  const headers = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Requested-With": "XMLHttpRequest",
  };
  const app = readXAppData();
  const appKeys = Object.keys(app);
  if (appKeys.length) {
    headers["x-app-data"] = `${appKeys.map((k) => `${k}=${app[k]}`).join(";")};`;
  }
  if (typeof app.BrowserSessionId === "string" && app.BrowserSessionId) {
    headers["x-browser-session-id"] = app.BrowserSessionId;
  }
  if (typeof app.custid === "string" && app.custid) {
    headers["x-custid"] = app.custid;
  }
  for (const key of appKeys) {
    const m = key.match(/^BrowserSessionId_(\d+)$/);
    if (m) {
      headers[`x-browser-session-id-${m[1]}`] = String(app[key]);
    }
    const c = key.match(/^custid_(\d+)$/);
    if (c) {
      headers[`x-custid-${c[1]}`] = String(app[key]);
    }
  }
  try {
    const inner = JSON.parse(localStorage.getItem("token") || "");
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      for (const [key, value] of Object.entries(inner)) {
        if (value == null || value === "") continue;
        if (!String(key).toLowerCase().startsWith("x-")) continue;
        headers[key] = String(value);
      }
    }
  } catch {
    /* optional */
  }
  const vh = localStorage.getItem("v-hucode");
  if (vh) headers["v-hucode"] = vh;
  return headers;
}

function uuid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * @param {string} path
 * @returns {Promise<string>}
 */
async function fetchWsTokenOnce(path) {
  const res = await fetch(`${path}?locale=zh_CN&_=${Date.now()}&withCredentials=true`, {
    credentials: "include",
    headers: buildPageAuthHeaders(),
  });
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
    throw new Error(`swstoken HTML(${res.status}) path=${path}`);
  }
  if (res.status === 403) {
    throw new Error(`swstoken 403 path=${path}`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`swstoken 非 JSON(${res.status}) path=${path}`);
  }
  const token = json?.data?.token || json?.token;
  if (!token || typeof token !== "string") {
    throw new Error(`swstoken 无 token path=${path}`);
  }
  return token;
}

/**
 * @returns {Promise<string>}
 */
async function fetchWsToken() {
  const paths = swstokenPathCandidates();
  /** @type {Error | null} */
  let last = null;
  for (const path of paths) {
    try {
      return await fetchWsTokenOnce(path);
    } catch (err) {
      last = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw last || new Error("swstoken 失败");
}

function buildSubscribeBody() {
  const app = readXAppData();
  const now = String(Date.now());
  const g = typeof app.g === "string" && app.g ? app.g : "QQ==";
  const dpQOr =
    (typeof app.dpQOr === "string" && app.dpQOr) || readCookie("dpQOr") || "";
  return {
    sp: 12,
    lg: "",
    ev: "",
    mk: 1,
    btg: "1",
    ot: 1,
    d: "",
    o: 1,
    l: 3,
    v: now,
    lv: now,
    me: 0,
    more: false,
    lang: "",
    tm: 0,
    pa: 0,
    c: "",
    g,
    pn: -1,
    ec: "",
    cl: 3,
    hle: false,
    pimo: "",
    inl: false,
    pv: 1,
    ic: false,
    ice: false,
    me01: "",
    ru: "",
    dpQOr,
    locale: "zh_CN",
  };
}

export class PbSportsWsObserve {
  constructor() {
    /** @type {WebSocket | null} */
    this.ws = null;
    this._manualClose = false;
    this._subscribed = false;
    this.frameCount = 0;
    this.vssid = "";
    this.lastError = "";
    this._reconnectTimer = null;
    this._retry = 0;
  }

  get readyState() {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  async start() {
    this._manualClose = false;
    await this._connect();
  }

  stop() {
    this._manualClose = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    try {
      this.ws?.close(1000, "observe_stop");
    } catch {
      /* ignore */
    }
    this.ws = null;
    this._subscribed = false;
    void this._publishStatus({ running: false, connected: false });
  }

  async _connect() {
    if (this._manualClose) return;
    try {
      const token = await fetchWsToken();
      const app = readXAppData();
      const ulp = typeof app._ulp === "string" ? app._ulp : "";
      if (!ulp) throw new Error("缺少 x-app-data._ulp");

      // [A8/官网] bundle 直拼 "?token="+token+"&ulp="+ulp，勿 encodeURIComponent（ulp 已是 URL 形态）
      const url = `wss://${location.hostname}${WS_PATH}?token=${token}&ulp=${ulp}`;
      void this._publishStatus({
        running: true,
        connected: false,
        tokenOk: true,
        lastError: "",
        phase: "ws_connecting",
      });

      const ws = new WebSocket(url);
      this.ws = ws;

      const connectedWatchdog = setTimeout(() => {
        if (this._manualClose || this.vssid || ws.readyState !== WebSocket.OPEN) return;
        this.lastError = "OPEN但无CONNECTED(>8s)";
        void this._publishStatus({
          running: true,
          connected: false,
          readyState: ws.readyState,
          lastError: this.lastError,
          phase: "wait_connected",
        });
      }, 8000);

      ws.onopen = () => {
        this._retry = 0;
        this.lastError = "";
        void this._publishStatus({
          running: true,
          connected: false,
          readyState: ws.readyState,
          phase: "ws_open",
          tokenOk: true,
        });
      };

      ws.onmessage = (ev) => {
        clearTimeout(connectedWatchdog);
        this._onMessage(String(ev.data ?? ""));
      };

      ws.onclose = (ev) => {
        clearTimeout(connectedWatchdog);
        this._subscribed = false;
        this.vssid = "";
        const reason = String(ev.reason || "");
        this.lastError = `ws_close ${ev.code}${reason ? ` ${reason}` : ""}`;
        void this._publishStatus({
          running: !this._manualClose,
          connected: false,
          readyState: WebSocket.CLOSED,
          phase: "ws_closed",
          lastError: this.lastError,
          lastClose: { code: ev.code, reason, wasClean: !!ev.wasClean },
        });
        this._scheduleReconnect();
      };

      ws.onerror = () => {
        this.lastError = "ws_error";
        void this._publishStatus({ lastError: this.lastError, phase: "ws_error" });
      };
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      void this._publishStatus({
        running: true,
        connected: false,
        tokenOk: false,
        phase: "token_fail",
        lastError: this.lastError,
      });
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this._manualClose) return;
    const delay = Math.min(1000 * Math.pow(1.5, this._retry), 30_000);
    this._retry += 1;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => void this._connect(), delay);
  }

  /**
   * @param {string} data
   */
  _onMessage(data) {
    let parsed = null;
    try {
      parsed = JSON.parse(data);
    } catch {
      this._forward("in", data, null);
      return;
    }

    const type = parsed?.type;
    if (type === "PING") {
      this._sendJson({ type: "PONG", destination: "ALL" });
      this._forward("in", data, parsed);
      return;
    }

    if (type === "CONNECTED") {
      this.vssid = typeof parsed.vssid === "string" ? parsed.vssid : "";
      this.lastError = "";
      this._forward("in", data, parsed);
      void this._publishStatus({
        connected: true,
        vssid: this.vssid,
        phase: "connected",
        lastError: "",
      });
      this._subscribeOdds();
      return;
    }

    if (type === "WEBSOCKET_DISABLED") {
      this.lastError = "WEBSOCKET_DISABLED";
      this._forward("in", data, parsed);
      void this._publishStatus({ lastError: this.lastError });
      return;
    }

    this._forward("in", data, parsed);
  }

  _subscribeOdds() {
    if (this._subscribed || this.ws?.readyState !== WebSocket.OPEN) return;
    const msg = {
      type: "SUBSCRIBE",
      destination: "ODDS",
      id: uuid(),
      body: buildSubscribeBody(),
    };
    this._sendJson(msg);
    this._subscribed = true;
    this._forward("out", JSON.stringify(msg), msg);
  }

  /**
   * @param {object} obj
   */
  _sendJson(obj) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const text = JSON.stringify(obj);
    this.ws.send(text);
  }

  /**
   * @param {"in"|"out"} dir
   * @param {string} raw
   * @param {object | null} parsed
   */
  _forward(dir, raw, parsed) {
    this.frameCount += 1;
    const type = parsed?.type ?? "";
    const destination = parsed?.destination ?? "";
    const frame = {
      t: Date.now(),
      dir,
      type,
      destination,
      n: raw.length,
      raw: raw.length <= MAX_RAW_CHARS ? raw : `${raw.slice(0, MAX_RAW_CHARS)}…`,
    };
    try {
      chrome.runtime.sendMessage({ type: "pbWsObserveFrame", frame });
    } catch {
      /* ignore */
    }
    void this._publishStatus({
      running: true,
      connected: type === "CONNECTED" || this.vssid !== "",
      readyState: this.readyState,
      frameCount: this.frameCount,
      lastType: type || "(raw)",
      lastDestination: destination,
      updatedAt: frame.t,
    });
  }

  /**
   * @param {Record<string, unknown>} patch
   */
  async _publishStatus(patch) {
    try {
      chrome.runtime.sendMessage({
        type: "pbWsObserveStatus",
        status: {
          host: location.hostname,
          href: location.pathname,
          vssid: this.vssid,
          lastError: this.lastError,
          frameCount: this.frameCount,
          readyState: this.readyState,
          ...patch,
          updatedAt: Date.now(),
        },
      });
    } catch {
      /* ignore */
    }
  }
}

export { STORAGE_STATUS_KEY, MAX_RECENT };
