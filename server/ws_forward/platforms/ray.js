/** 与 `client/platform-adapter/ray/a8Collect.ts` RAY_WS / token 同步 */
export const RAY_OFFICIAL_WS_URL = "wss://cfsocket.365raylinks.com/socketcluster/";
export const RAY_OFFICIAL_ORIGIN = "https://ray164.com";
export const RAY_DEFAULT_AUTH =
  "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhcHBfa2V5IjoiY2QyNzZmZTQ5YmEyZTQ1YiIsImRhdGEiOnsidXNlcl9uYW1lIjoiaHVhMTk5NDMxIiwibG9iYnlfdXJsIjoiLyMvbG9naW4vIiwiaWF0IjoiNjM4NTQwNjkyOTkifX0.Y1k61j-43efe0UonN4mfpVMLvaSlFZihGeLCxYV4tKM";

/** @type {import('../core/types.js').RawWsForwardDefinition} */
export const rayForwardDefinition = {
  id: "RAY",
  transport: "raw-ws",
  browserPath: "/esport/ws-forward/RAY",
  resolveUpstream(request) {
    const auth =
      request.headers.authorization ||
      request.headers.Authorization ||
      RAY_DEFAULT_AUTH;
    return {
      url: RAY_OFFICIAL_WS_URL,
      headers: {
        Origin: RAY_OFFICIAL_ORIGIN,
        Referer: `${RAY_OFFICIAL_ORIGIN}/`,
        Authorization: String(auth),
      },
    };
  },
};
