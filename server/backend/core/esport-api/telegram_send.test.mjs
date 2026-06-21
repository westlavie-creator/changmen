import assert from "node:assert/strict";
import { it } from "vitest";
import { handleSendMessage, isValidChatId } from "./telegram_send.js";

it("isValidChatId accepts user and group ids", () => {
  assert.equal(isValidChatId("123456789"), true);
  assert.equal(isValidChatId(-1001949068832), true);
  assert.equal(isValidChatId("-4855267884"), true);
  assert.equal(isValidChatId("abc"), false);
  assert.equal(isValidChatId(""), false);
});

it("handleSendMessage requires bot token", async () => {
  const prev = process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  try {
    const r = await handleSendMessage({ chat_id: "1", text: "hi" });
    assert.equal(r.ok, false);
    assert.match(r.msg, /TELEGRAM_BOT_TOKEN/);
  }
  finally {
    if (prev !== undefined)
      process.env.TELEGRAM_BOT_TOKEN = prev;
  }
});

it("handleSendMessage validates body", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  try {
    assert.equal((await handleSendMessage({ text: "x" })).ok, false);
    assert.equal((await handleSendMessage({ chat_id: "bad", text: "x" })).ok, false);
    assert.equal((await handleSendMessage({ chat_id: "1", text: "  " })).ok, false);
  }
  finally {
    delete process.env.TELEGRAM_BOT_TOKEN;
  }
});
