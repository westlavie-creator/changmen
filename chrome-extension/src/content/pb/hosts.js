/** PB 官网域名（sports-websocket 同源建连） */

const PB_HOST_RE = /(^|\.)(part888|ps3838)\.com$/i;

export function isPbSportsHost(hostname = location.hostname) {
  return PB_HOST_RE.test(String(hostname || ""));
}

/** 仅 top frame 建连，避免 iframe 多开 WS */
export function isPbWsTopFrame() {
  try {
    return window === window.top;
  } catch {
    return true;
  }
}
