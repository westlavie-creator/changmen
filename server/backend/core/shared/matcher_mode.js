/** matchMerge 与 backend 同进程内嵌；由 server.js 启动循环时 setEmbeddedMatcher(true)。 */

let _embedded = false;

export function setEmbeddedMatcher(enabled = true) {
  _embedded = !!enabled;
}

export function isEmbeddedMatcher() {
  return _embedded;
}
