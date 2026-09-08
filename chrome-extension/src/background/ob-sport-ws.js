/**
 * 遗留：足球页已直连 yewuws2，不再经本模块建连。
 * 若旧页面仍 connect `ob-sport-ws` 端口，才打开官网 origin 弹窗。
 */
export const OB_SPORT_WS_PORT = "ob-sport-ws";
const DEFAULT_SHELL = "https://user-pc-new.dbgaming.com";
const OWNED_WAIT_MS = 12000;

async function frameToText(data) {
  if (data == null)
    return null;
  if (typeof data === "string")
    return data;
  if (typeof Blob !== "undefined" && data instanceof Blob)
    return data.text();
  if (typeof ArrayBuffer !== "undefined" && (data instanceof ArrayBuffer || ArrayBuffer.isView(data)))
    return new TextDecoder().decode(data);
  return null;
}

function keepPushCmd(cmd) {
  const c = String(cmd || "").toUpperCase();
  if (!c)
    return true;
  return /^(C105|C102|C103|C101|C109|C302|C303)$/.test(c);
}

function bytesFromBase64(data) {
  const compact = String(data || "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = compact + "=".repeat((4 - (compact.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++)
    out[i] = bin.charCodeAt(i);
  return out;
}

async function decompressBytes(bytes, format) {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const ds = new DecompressionStream(format);
  const stream = new Blob([copy]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buf);
}

async function inflateBytes(bytes) {
  const attempts = [];
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b)
    attempts.push(() => decompressBytes(bytes, "gzip"));
  attempts.push(
    () => decompressBytes(bytes, "deflate"),
    () => decompressBytes(bytes, "deflate-raw"),
  );
  if (bytes.length > 6 && bytes[0] === 0x78)
    attempts.push(() => decompressBytes(bytes.subarray(2, bytes.length - 4), "deflate-raw"));
  let last;
  for (const run of attempts) {
    try {
      return await run();
    }
    catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("inflate failed");
}

function parseInflatedText(text) {
  const raw = String(text || "").trim();
  if (!raw)
    return null;
  try {
    return JSON.parse(raw);
  }
  catch { /* uri-encoded */ }
  try {
    return JSON.parse(decodeURIComponent(raw));
  }
  catch {
    return null;
  }
}

async function unzipCd(cd) {
  if (cd == null || typeof cd === "object")
    return cd;
  if (typeof cd !== "string" || !cd.trim())
    return cd;
  try {
    return JSON.parse(cd);
  }
  catch { /* compressed */ }
  let bytes;
  try {
    bytes = bytesFromBase64(cd);
  }
  catch {
    return cd;
  }
  if (!bytes.length)
    return cd;
  try {
    const parsed = parseInflatedText(await inflateBytes(bytes));
    if (parsed != null)
      return parsed;
  }
  catch { /* keep */ }
  return cd;
}

async function enrichPush(raw) {
  if (raw == null)
    return raw;
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    }
    catch {
      return raw;
    }
  }
  if (Array.isArray(parsed)) {
    const out = [];
    for (const item of parsed)
      out.push(await enrichPush(item));
    return out;
  }
  if (!parsed || typeof parsed !== "object")
    return parsed;
  const cmd = String(parsed.cmd || parsed.CMD || parsed.data?.cmd || "").toUpperCase();
  if (cmd && !keepPushCmd(cmd))
    return null;
  if (typeof parsed.cd === "string") {
    const unzipped = await unzipCd(parsed.cd);
    if (unzipped && typeof unzipped === "object")
      parsed.cd = unzipped;
  }
  return parsed;
}

/** @type {Set<chrome.runtime.Port>} */
const ports = new Set();
/** @type {WebSocket | null} */
let swSocket = null;
/** @type {number | null} */
let tabId = null;
/** @type {number | null} */
let ownedTabId = null;
/** @type {number | null} */
let ownedWindowId = null;
/** @type {chrome.runtime.Port | null} */
let helperPort = null;
/** @type {((port: chrome.runtime.Port | null) => void)[]} */
let helperWaiters = [];
let tapMode = false;
let heardOpen = false;
let activeToken = "";
const OB_SPORT_WS_HELPER_PORT = "ob-sport-ws-helper";

function broadcast(msg) {
  for (const port of ports) {
    try {
      port.postMessage(msg);
    }
    catch { /* port gone */ }
  }
}

async function broadcastPush(raw) {
  const enriched = await enrichPush(raw);
  if (enriched == null)
    return;
  broadcast({ type: "message", data: enriched });
}

function hostOf(href) {
  try {
    return new URL(href).host;
  }
  catch {
    return "";
  }
}

function isRealSportSpa(href) {
  try {
    const u = new URL(href);
    if (/cm_ob_sport_ws/i.test(`${u.pathname}${u.search}`))
      return false;
    const host = u.hostname.toLowerCase();
    if (!/(^|\.)dbgaming\.com$/i.test(host))
      return false;
    return /user-pc-new/i.test(host) || /[?&]token=|[?&]gr=/i.test(u.search);
  }
  catch {
    return false;
  }
}

/**
 * @param {string} [referer]
 * @returns {Promise<chrome.tabs.Tab | null>}
 */
async function findSportSpaTab(referer) {
  const wantRef = hostOf(referer || "").toLowerCase();
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  }
  catch {
    return null;
  }
  let best = null;
  let bestScore = 0;
  for (const tab of tabs) {
    if (!isRealSportSpa(tab.url || ""))
      continue;
    if (tab.id === ownedTabId)
      continue;
    const host = hostOf(tab.url || "").toLowerCase();
    let score = 1;
    if (wantRef && host === wantRef)
      score = 2;
    if (score > bestScore) {
      bestScore = score;
      best = tab;
    }
  }
  return best;
}

function markOpen() {
  heardOpen = true;
}

function closeSwSocket() {
  if (!swSocket)
    return;
  try {
    swSocket.close();
  }
  catch { /* ignore */ }
  swSocket = null;
}

function stopTabSocket() {
  if (tabId == null)
    return;
  try {
    chrome.tabs.sendMessage(tabId, { type: "obSportWsControl", cmd: "close" });
  }
  catch { /* ignore */ }
  tabId = null;
}

function resolveHelperWaiters(port) {
  const pending = helperWaiters;
  helperWaiters = [];
  for (const fn of pending)
    fn(port);
}

function attachHelperPort(port) {
  helperPort = port;
  resolveHelperWaiters(port);
  port.onDisconnect.addListener(() => {
    if (helperPort === port)
      helperPort = null;
  });
}

function waitHelperPort(ms) {
  if (helperPort)
    return Promise.resolve(helperPort);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      helperWaiters = helperWaiters.filter(fn => fn !== onReady);
      resolve(null);
    }, ms);
    const onReady = (port) => {
      clearTimeout(timer);
      resolve(port);
    };
    helperWaiters.push(onReady);
  });
}

async function closeOffscreen() {
  if (!chrome.offscreen?.closeDocument)
    return;
  try {
    await chrome.offscreen.closeDocument();
  }
  catch { /* none */ }
}

async function closeOwnedHelperWindow() {
  const winId = ownedWindowId;
  const keepTab = ownedTabId;
  ownedWindowId = null;
  ownedTabId = null;
  if (winId != null) {
    try {
      await chrome.windows.remove(winId);
      return;
    }
    catch { /* already gone */ }
  }
  if (keepTab != null) {
    try {
      await chrome.tabs.remove(keepTab);
    }
    catch { /* already gone */ }
  }
}

async function closeStrayHelperTabs() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  }
  catch {
    return;
  }
  for (const tab of tabs) {
    if (tab.id == null || tab.id === ownedTabId)
      continue;
    if (/cm_ob_sport_ws/i.test(tab.url || "")) {
      try {
        await chrome.tabs.remove(tab.id);
      }
      catch { /* ignore */ }
    }
  }
}

async function stopHelper() {
  try {
    helperPort?.postMessage({ cmd: "close" });
    helperPort?.disconnect();
  }
  catch { /* ignore */ }
  helperPort = null;
  resolveHelperWaiters(null);
  await closeOffscreen();
  await closeOwnedHelperWindow();
}

function shellOrigin(referer) {
  try {
    const u = new URL(String(referer || "").trim() || DEFAULT_SHELL);
    if ((u.protocol === "http:" || u.protocol === "https:") && /(^|\.)dbgaming\.com$/i.test(u.hostname))
      return u.origin;
  }
  catch { /* default */ }
  return DEFAULT_SHELL;
}

function helperPageUrl(referer, token) {
  const u = new URL(`${shellOrigin(referer)}/`);
  u.searchParams.set("cm_ob_sport_ws", "1");
  const tok = String(token || "").trim();
  if (tok) {
    u.searchParams.set("token", tok);
    u.searchParams.set("gr", "common");
  }
  return u.toString();
}

async function tabAlive(id) {
  if (id == null)
    return false;
  try {
    const tab = await chrome.tabs.get(id);
    return tab?.id != null;
  }
  catch {
    return false;
  }
}

async function openOnHelperTab(tab, wsUrl) {
  tabId = tab.id;
  ownedTabId = tab.id;
  if (tab.windowId != null)
    ownedWindowId = tab.windowId;
  if (helperPort) {
    try {
      helperPort.postMessage({ cmd: "open", url: wsUrl, token: activeToken });
      return true;
    }
    catch {
      helperPort = null;
    }
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "obSportWsControl", cmd: "open", url: wsUrl, token: activeToken });
    return true;
  }
  catch { /* content not ready */ }
  const port = await waitHelperPort(OWNED_WAIT_MS);
  if (!port)
    return false;
  try {
    port.postMessage({ cmd: "open", url: wsUrl, token: activeToken });
    return true;
  }
  catch {
    return false;
  }
}

async function hideHelperWindow(id) {
  if (id == null)
    return;
  try {
    await chrome.windows.update(id, { state: "minimized", focused: false });
  }
  catch { /* ignore */ }
}

/**
 * 在官网 origin 文档里 new WebSocket，Origin 才是 dbgaming。
 * 用独立最小化弹窗，不进用户当前窗口的标签栏。
 */
async function startOwnedHelperWindow(wsUrl, referer) {
  tapMode = false;
  closeSwSocket();
  await closeOffscreen();

  if (ownedTabId != null && await tabAlive(ownedTabId)) {
    try {
      const tab = await chrome.tabs.get(ownedTabId);
      if (tab && await openOnHelperTab(tab, wsUrl))
        return true;
    }
    catch { /* recreate */ }
    ownedTabId = null;
    ownedWindowId = null;
  }

  await closeStrayHelperTabs();
  let created;
  try {
    created = await chrome.windows.create({
      url: helperPageUrl(referer, activeToken),
      type: "popup",
      focused: false,
      width: 320,
      height: 180,
    });
  }
  catch (err) {
    broadcast({ type: "error", message: err instanceof Error ? err.message : String(err) });
    return false;
  }
  const tab = created?.tabs?.[0];
  if (tab?.id == null) {
    broadcast({ type: "error", message: "ob-sport helper window missing tab" });
    return false;
  }
  ownedWindowId = created.id ?? null;
  ownedTabId = tab.id;
  tabId = tab.id;
  void hideHelperWindow(ownedWindowId);
  return await openOnHelperTab(tab, wsUrl);
}

/**
 * @param {string} url
 * @param {string} [referer]
 */
async function connect(url, referer) {
  heardOpen = false;
  tapMode = false;
  stopTabSocket();
  closeSwSocket();

  const spa = await findSportSpaTab(referer);
  if (spa?.id != null) {
    tabId = spa.id;
    try {
      const tapped = await chrome.tabs.sendMessage(spa.id, { type: "obSportWsControl", cmd: "tap" });
      if (tapped?.hookLive) {
        tapMode = true;
        markOpen();
        return;
      }
    }
    catch { /* no listener */ }
    tabId = null;
  }
  const ok = await startOwnedHelperWindow(url, referer);
  if (!ok)
    broadcast({ type: "error", message: "ob-sport helper origin window failed" });
}

function sendPayload(payload) {
  if (tapMode)
    return;
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  if (helperPort) {
    try {
      helperPort.postMessage({ cmd: "send", payload: text });
    }
    catch { /* ignore */ }
    return;
  }
  if (tabId != null) {
    chrome.tabs.sendMessage(tabId, { type: "obSportWsControl", cmd: "send", payload: text });
    return;
  }
}

function disconnectSocket() {
  activeToken = "";
  tapMode = false;
  heardOpen = false;
  stopTabSocket();
  closeSwSocket();
  void stopHelper();
}

/**
 * @param {chrome.runtime.Port} port
 */
export function attachObSportWsPort(port) {
  ports.add(port);
  port.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== "object")
      return;
    const cmd = String(msg.cmd || "");
    if (cmd === "open") {
      const url = String(msg.url || "").trim();
      activeToken = String(msg.token || "").trim();
      if (!url)
        return;
      void connect(url, String(msg.referer || ""));
      return;
    }
    if (cmd === "send") {
      sendPayload(msg.payload);
      return;
    }
    if (cmd === "close")
      disconnectSocket();
  });
  port.onDisconnect.addListener(() => {
    ports.delete(port);
    if (!ports.size)
      disconnectSocket();
  });
}

export function installObSportWsBackground() {
  chrome.runtime.onConnect.addListener((port) => {
    if (port?.name === OB_SPORT_WS_HELPER_PORT)
      attachHelperPort(port);
  });
  chrome.tabs.onRemoved.addListener((id) => {
    if (id !== ownedTabId && id !== tabId)
      return;
    if (id === ownedTabId) {
      ownedTabId = null;
      ownedWindowId = null;
    }
    if (id === tabId)
      tabId = null;
    if (tapMode || !ports.size)
      return;
    broadcast({ type: "close", code: 1006, reason: "helper tab closed" });
  });
}

/**
 * content script 把官网 Tab 里的 WS 帧交回页面。
 * @param {unknown} message
 * @returns {boolean}
 */
export function handleObSportWsEvent(message) {
  if (!message || message.type !== "obSportWsEvent")
    return false;
  const kind = String(message.kind || "");
  if (kind === "open" || kind === "tap") {
    markOpen();
    tapMode = kind === "tap";
    broadcast({ type: "open" });
  }
  else if (kind === "message")
    void broadcastPush(message.data);
  else if (kind === "error")
    broadcast({ type: "error", message: String(message.message || "ob-sport ws error") });
  else if (kind === "close")
    broadcast({ type: "close", code: message.code, reason: message.reason });
  return true;
}
