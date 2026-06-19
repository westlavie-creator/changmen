/** @type {import('../core/types.js').RawWsForwardDefinition} */
export const obForwardDefinition = {
  id: "OB",
  transport: "raw-ws",
  browserPath: "/esport/ws-forward/OB",
  resolveUpstream(request) {
    const url = new URL(request.url || "/", "http://localhost");
    const upstream = url.searchParams.get("u");
    if (!upstream || !/^wss?:\/\//i.test(upstream)) {
      throw new Error("missing or invalid upstream query u");
    }
    return { url: upstream };
  },
};
