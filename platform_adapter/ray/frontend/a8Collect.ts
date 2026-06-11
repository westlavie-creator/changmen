/**
 * A8 `bQe` 采集凭证（与 `platform_adapter/ray/backend/collect_credentials.js` 同步）。
 */
export const RAY_A8_COLLECT = {
  gateway: "https://cfinfo.365raylinks.com",
  token:
    "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhcHBfa2V5IjoiY2QyNzZmZTQ5YmEyZTQ1YiIsImRhdGEiOnsidXNlcl9uYW1lIjoiaHVhMTk5NDMxIiwibG9iYnlfdXJsIjoiLyMvbG9naW4vIiwiaWF0IjoiNjM4NTQwNjkyOTkifX0.Y1k61j-43efe0UonN4mfpVMLvaSlFZihGeLCxYV4tKM",
  betName: "^获胜者$",
  games: ["70", "151", "140", "74", "37197927"],
} as const;

/** RAY 源站 SocketCluster（与 ray/backend/ws.js DEFAULT_WS 一致） */
export const RAY_WS = {
  hostname: "cfsocket.365raylinks.com",
  path: "/socketcluster/",
  channel: "match",
  origin: "https://ray164.com",
} as const;
