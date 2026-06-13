import assert from "node:assert/strict";
import {
  lastLoginFieldsFromProfile,
  normalizeClientIp,
} from "./user_login_meta.js";

assert.equal(normalizeClientIp("::1"), "127.0.0.1");
assert.equal(normalizeClientIp("::ffff:192.168.1.10"), "192.168.1.10");
assert.equal(normalizeClientIp(" 203.0.113.5 "), "203.0.113.5");

const fields = lastLoginFieldsFromProfile({
  preferences: { lastLoginIp: "1.2.3.4", lastLoginAt: 1700000000000 },
});
assert.equal(fields.lastLoginIp, "1.2.3.4");
assert.equal(fields.lastLoginAt, 1700000000000);

console.log("user_login_meta.test.mjs ok");
