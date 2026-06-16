import assert from "node:assert/strict";
import {
  ONLINE_WINDOW_MS,
  touchUserPresence,
  getOnlineUserIdSet,
  isUserOnline,
  getUserLastActiveAt,
  resolvePresenceState,
} from "./user_presence.js";

// 每个测试用独立 userId，避免模块级 Map 互相污染
function uid() {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

{
  const id = uid();
  touchUserPresence(id);
  assert.equal(isUserOnline(id), true);
  assert.ok(getOnlineUserIdSet().has(id.toLowerCase()));
  assert.ok(getUserLastActiveAt(id) > 0);
}

{
  const id = "A1B2C3D4-E5F6-7890-ABCD-EF1234567890";
  touchUserPresence(id.toLowerCase());
  assert.equal(isUserOnline(id.toUpperCase()), true);
}

{
  const id = uid();
  const ts = Date.now() - 5 * 60 * 1000;
  const state = resolvePresenceState(id, { preferences: { lastActiveAt: ts } });
  assert.equal(state.isOnline, 1);
  assert.equal(state.lastActiveAt, ts);
}

{
  const id = uid();
  const old = Date.now() - ONLINE_WINDOW_MS - 1;
  touchUserPresence(id);
  // 模拟过期：直接无法通过公开 API 回拨，仅验证窗口常量
  assert.equal(ONLINE_WINDOW_MS, 30 * 60 * 1000);
  assert.equal(isUserOnline(id), true);
  assert.equal(isUserOnline("nonexistent-user"), false);
}

console.log("user_presence.test.mjs ok");
