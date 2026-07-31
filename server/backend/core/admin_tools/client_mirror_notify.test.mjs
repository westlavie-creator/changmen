import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetClientMirrorNotifyRateForTests,
  handleClientNotifyAdminTelegram,
} from "./client_mirror_notify.js";
import { sendAdminNotify } from "./telegram.js";

vi.mock("./telegram.js", () => ({
  isAdminNotifyEnabled: vi.fn(() => true),
  sendAdminNotify: vi.fn(async () => ({ ok: true })),
}));

describe("admin_tools/client_mirror_notify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetClientMirrorNotifyRateForTests();
  });

  it("requires login", async () => {
    const r = await handleClientNotifyAdminTelegram({ text: "hi" }, null);
    expect(r.ok).toBe(false);
    expect(sendAdminNotify).not.toHaveBeenCalled();
  });

  it("requires text", async () => {
    const r = await handleClientNotifyAdminTelegram({}, { id: "u1", userName: "alice" });
    expect(r.ok).toBe(false);
    expect(sendAdminNotify).not.toHaveBeenCalled();
  });

  it("forwards to admin chat with user label", async () => {
    const r = await handleClientNotifyAdminTelegram(
      { text: "<b>下单提醒</b>", notifyType: "下单提醒" },
      { id: "u1", userName: "alice" },
    );
    expect(r.ok).toBe(true);
    expect(sendAdminNotify).toHaveBeenCalledTimes(1);
    const [payload, parseMode, notifyType] = sendAdminNotify.mock.calls[0];
    expect(parseMode).toBe("HTML");
    expect(notifyType).toBe("下单提醒");
    expect(payload).toContain("用户：alice");
    expect(payload).toContain("<b>下单提醒</b>");
  });

  it("rejects client chat_id by ignoring it (no chat_id arg to sendAdminNotify)", async () => {
    await handleClientNotifyAdminTelegram(
      { text: "x", chat_id: "-999" },
      { id: "u1", userName: "bob" },
    );
    expect(sendAdminNotify.mock.calls[0].length).toBe(3);
  });
});
