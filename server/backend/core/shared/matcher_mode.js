/** 与 server.js / matcher_process 一致：embedded matcher 与 backend 同进程。 */
export function isEmbeddedMatcher() {
  return String(process.env.MATCHER_EMBEDDED || "").trim() === "1";
}
