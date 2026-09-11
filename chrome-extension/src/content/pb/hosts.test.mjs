import assert from "node:assert/strict";
import {
  hostnameMatchesPbAccountHosts,
  normalizePbAccountHosts,
  pageMatchesPbAccountHosts,
  pbLiveHttpHostAllowed,
  pickPbLiveTabIds,
  pbHostFromUrl,
  tabUrlMatchesPbAccountHosts,
  tabUrlPatternsForPbHosts,
} from "./hosts.js";

assert.equal(pbHostFromUrl("https://skin.example/zh-cn/compact/sports"), "skin.example");
assert.equal(pbHostFromUrl("www.part888.com"), "www.part888.com");
assert.deepEqual(normalizePbAccountHosts(["WWW.Foo.COM", "www.foo.com"]), ["www.foo.com"]);
assert.equal(hostnameMatchesPbAccountHosts("www.pb.example", ["pb.example"]), true);
assert.equal(hostnameMatchesPbAccountHosts("pb.example", ["www.pb.example"]), true);
assert.equal(hostnameMatchesPbAccountHosts("other.example", ["pb.example"]), false);

const skinPatterns = tabUrlPatternsForPbHosts(["skin.example"]);
assert.deepEqual(skinPatterns, ["*://skin.example/*", "*://*.skin.example/*"]);

const wwwPatterns = new Set(tabUrlPatternsForPbHosts(["www.part888.com"]));
assert.equal(wwwPatterns.has("*://www.part888.com/*"), true);
assert.equal(wwwPatterns.has("*://part888.com/*"), true);
assert.equal(wwwPatterns.has("*://*.part888.com/*"), true);

const win = { location: { hostname: "skin.example" } };
win.top = win;
assert.equal(pageMatchesPbAccountHosts(["skin.example"], win), true);

const iframe = { location: { hostname: "" }, top: win };
assert.equal(pageMatchesPbAccountHosts(["skin.example"], iframe), true);
assert.equal(pbLiveHttpHostAllowed([], win), true);
assert.equal(pbLiveHttpHostAllowed(["skin.example"], win), true);
assert.equal(pbLiveHttpHostAllowed(["other.example"], win), false);
assert.equal(tabUrlMatchesPbAccountHosts("https://skin.example/zh-cn/compact/sports", ["skin.example"]), true);
assert.equal(tabUrlMatchesPbAccountHosts("https://other.example/", ["skin.example"]), false);
assert.deepEqual(
  pickPbLiveTabIds(
    [{ id: 1, url: "https://old.example/" }, { id: 2, url: "https://portal.example/" }],
    ["skin.example"],
    { 2: "skin.example" },
  ),
  [2],
);
assert.deepEqual(
  pickPbLiveTabIds(
    [{ id: 1, url: "https://lobby.example/" }, { id: 8, url: "https://lobby.example/" }],
    ["skin.example"],
    { 8: "skin.example" },
  ),
  [8],
);

console.log("pb account hosts: ok");
