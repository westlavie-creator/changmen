import assert from "node:assert/strict";
import {
  frozenFieldsFromProfile,
  isProfileFrozen,
  nextPreferencesForFreeze,
} from "./user_freeze.js";

assert.deepEqual(frozenFieldsFromProfile({ preferences: { frozen: true, frozenAt: 123 } }), {
  frozen: 1,
  frozenAt: 123,
});
assert.deepEqual(frozenFieldsFromProfile({ preferences: {} }), { frozen: 0, frozenAt: 0 });
assert.equal(isProfileFrozen({ preferences: { frozen: true } }), true);
assert.equal(isProfileFrozen({ preferences: {} }), false);

const frozenPrefs = nextPreferencesForFreeze({}, true, "admin-1");
assert.equal(frozenPrefs.frozen, true);
assert.equal(frozenPrefs.frozenBy, "admin-1");

const unfrozenPrefs = nextPreferencesForFreeze(frozenPrefs, false, "admin-2");
assert.equal(unfrozenPrefs.frozen, undefined);
assert.equal(unfrozenPrefs.unfrozenBy, "admin-2");

console.log("user_freeze.test.mjs ok");
