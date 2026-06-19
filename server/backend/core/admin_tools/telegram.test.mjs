import { describe, expect, it } from "vitest";
import { prefixAdminNotifyBody } from "./telegram.js";

describe("admin_tools/telegram", () => {
  it("prefixAdminNotifyBody adds admin notify type label", () => {
    const out = prefixAdminNotifyBody("<b>正文</b>", "新订单");
    expect(out).toBe("<b>【管理员·新订单】</b>\n<b>正文</b>");
  });

  it("escapes notify type for HTML", () => {
    const out = prefixAdminNotifyBody("x", "<script>");
    expect(out).toContain("【管理员·&lt;script&gt;】");
  });
});
