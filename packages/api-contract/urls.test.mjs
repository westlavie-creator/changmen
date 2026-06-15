import assert from "node:assert/strict";
import {
  buildEsportPath,
  buildEsportUrl,
  buildHttpRelayUrl,
  normalizeApiBase,
} from "./urls.mjs";

assert.equal(normalizeApiBase("https://api.example.com/"), "https://api.example.com");
assert.equal(buildEsportPath("Client_GetMatchs"), "/esport/Client_GetMatchs");
assert.equal(buildEsportPath("API_SaveMatch", "?OB"), "/esport/API_SaveMatch?OB");
assert.equal(
  buildEsportUrl("Client_Login", "", "https://api.example.com"),
  "https://api.example.com/esport/Client_Login",
);
assert.equal(buildEsportUrl("Client_Login"), "/esport/Client_Login");
assert.equal(
  buildHttpRelayUrl({ apiBase: "https://api.example.com" }),
  "https://api.example.com/esport/http-relay",
);
assert.equal(buildHttpRelayUrl(), "/esport/http-relay");

console.log("api-contract urls: OK");
