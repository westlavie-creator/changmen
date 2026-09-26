import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const token = "3d2d98226690510f2575b5d4c7a2de26f9b5e666";
const posted = [];
let nextBody = JSON.stringify({
  status_code: 100,
  data: {
    html: `https://app-h5.janbo0931.com/?token=${token}&gr=s`,
  },
});

const context = {
  URL,
  Set,
  Object,
  JSON,
  Promise,
  location: {
    href: "https://www.iz9a9g.vip:6677/home/sports/OBSPORT?api_id=53",
  },
  fetch: async () => ({
    clone: () => ({ text: async () => nextBody }),
  }),
  postMessage: value => posted.push(value),
};
context.window = context;
context.globalThis = context;

const source = fs.readFileSync(
  new URL("./src/content/page-hooks/ob-sport-merchant-response-hook.js", import.meta.url),
  "utf8",
);
vm.runInNewContext(source, context);

await context.fetch("/game/api/v1/venue/launchV6", { method: "POST" });
await new Promise(resolve => setImmediate(resolve));
assert.equal(posted[0]?.token, token);
assert.equal(posted[0]?.gateway, "https://app-h5.janbo0931.com");

nextBody = JSON.stringify({ code: "0000000", data: { userId: "53554662319712599617" } });
await context.fetch(`/yewu12/api/user/getUserInfo?token=${token}&enName=OBSPORT`);
await new Promise(resolve => setImmediate(resolve));
assert.equal(posted[1]?.token, token);
assert.equal(posted[1]?.sessionId, "53554662319712599617");

console.log("ob-merchant-response-hook.smoke: ok");
