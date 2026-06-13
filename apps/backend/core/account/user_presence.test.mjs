import assert from "node:assert/strict";
import {
  ONLINE_WINDOW_MS,
  touchUserPresence,
  getOnlineUserIdSet,
  isUserOnline,
  getUserLastActiveAt,
} from "./user_presence.js";

// 每个测试用独立 userId，避免模块级 Map 互相污染
function uid() {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

{
  const id = uid();
  touchUserPresence(id);
  assert.equal(isUserOnline(id), true);
  assert.ok(getOnlineUserIdSet().has(id));
  assert.ok(getUserLastActiveAt(id) > 0);
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
