/**
 * 扩展 offscreen 文档里建 yewuws2（不是 SW：SW 的 WS 握手 DNR 改不了 Origin）。
 * 页面 Origin 仍是 chrome-extension://，靠 DNR 把握手 Origin 改成官网。
 */
const HELPER_PORT = "ob-sport-ws-helper";
const KEEP_CMD = /^(C105|C102|C103|C101|C109|C302|C303)$/;

let socket = null;
/** @type {chrome.runtime.Port | null} */
let port = null;

function cmdOf(data) {
  if (typeof data !== "string")
    return "";
  const m = data.match(/"(?:cmd|CMD)"\s*:\s*"([^"]+)"/);
  return m ? String(m[1] || "").toUpperCase() : "";
}

function keepFrame(data) {
  const cmd = cmdOf(data);
  if (!cmd)
    return true;
  return KEEP_CMD.test(cmd);
}

function emit(kind, extra = {}) {
  try {
    chrome.runtime.sendMessage({ type: "obSportWsEvent", kind, ...extra });
  }
  catch { /* ignore */ }
}

function closeSocket() {
  if (!socket)
    return;
  try {
    socket.close();
  }
  catch { /* ignore */ }
  socket = null;
}

function openSocket(url) {
  closeSocket();
  let next;
  try {
    next = new WebSocket(url);
  }
  catch (err) {
    emit("error", { message: err instanceof Error ? err.message : String(err) });
    return;
  }
  socket = next;
  next.addEventListener("open", () => {
    if (socket !== next)
      return;
    emit("open");
  });
  next.addEventListener("message", (ev) => {
    if (socket !== next)
      return;
    const data = ev.data;
    if (typeof data === "string") {
      if (keepFrame(data))
        emit("message", { data });
      return;
    }
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      void data.text().then((text) => {
        if (socket === next && keepFrame(text))
          emit("message", { data: text });
      });
      return;
    }
    if (typeof ArrayBuffer !== "undefined" && (data instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
      const text = new TextDecoder().decode(data);
      if (keepFrame(text))
        emit("message", { data: text });
    }
  });
  next.addEventListener("error", () => {
    if (socket !== next)
      return;
    emit("error", { message: "ob-sport offscreen ws error" });
  });
  next.addEventListener("close", (ev) => {
    if (socket !== next)
      return;
    socket = null;
    emit("close", { code: ev.code, reason: ev.reason });
  });
}

function applyControl(cmd, message) {
  if (cmd === "open")
    openSocket(String(message.url || ""));
  else if (cmd === "send" && socket?.readyState === 1)
    socket.send(String(message.payload || ""));
  else if (cmd === "close")
    closeSocket();
}

function connectPort() {
  try {
    port = chrome.runtime.connect({ name: HELPER_PORT });
  }
  catch {
    setTimeout(connectPort, 400);
    return;
  }
  port.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== "object")
      return;
    applyControl(String(msg.cmd || ""), msg);
  });
  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(connectPort, 400);
  });
}

connectPort();
