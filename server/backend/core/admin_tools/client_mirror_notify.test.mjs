import { describe, expect, it, vi } from "vitest";

import { handleClientNotifyAdminTelegram } from "./client_mirror_notify.js";
import { sendAdminNotify } from "./telegram.js";

vi.mock("./telegram.js", () => ({
  isAdminNotifyEnabled: vi.fn(() => true),
  sendAdminNotify: vi.fn(async () => ({ ok: true })),
}));

describe("admin_tools/client_mirror_notify", () => {
  it("requires login", async () => {
    const r = await handleClientNotifyAdminTelegram({ text: "hi" }, null);
    expect(r.ok).toBe(false);
    expect(sendAdminNotify).not.toHaveBeenCalled();
  });

  it("does not copy order alerts to the admin Telegram", async () => {
    const r = await handleClientNotifyAdminTelegram(
      { text: "<b>下单提醒</b>", notifyType: "下单提醒" },
      { id: "u1", userName: "alice" },
    );
    expect(r).toEqual({ ok: true, skipped: true });
    expect(sendAdminNotify).not.toHaveBeenCalled();
  });
});
