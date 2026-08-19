/** PB 官网域名（sports-websocket 同源建连） */

const PB_HOST_RE = /(^|\.)(part888|ps3838)\.com$/i;

export function isPbSportsHost(hostname = location.hostname) {
  if (PB_HOST_RE.test(String(hostname || ""))) return true;
  // about:blank / srcdoc：hostname 为空，但父页仍是 part888
  try {
    if (window !== window.top && PB_HOST_RE.test(String(window.top.location.hostname || "")))
      return true;
  } catch {
    /* cross-origin */
  }
  return false;
}

/** 仅 top frame 建连，避免 iframe 多开 WS */
export function isPbWsTopFrame() {
  try {
    return window === window.top;
  } catch {
    return true;
  }
}
