import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveOrderBind } from "@/api/order";

const post = vi.hoisted(() => vi.fn());

vi.mock("@/api/client", () => ({
  post,
  unwrap: (x: unknown) => x,
}));

describe("saveOrderBind", () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({ success: 1 });
  });

  it("skips POST when binds array is empty (A8 Vt.saveOrderBind)", async () => {
    const ok = await saveOrderBind({ orders: "[]" });
    expect(ok).toBe(true);
    expect(post).not.toHaveBeenCalled();
  });

  it("pOSTs when binds array has rows and returns true on success", async () => {
    const ok = await saveOrderBind({
      orders: JSON.stringify([{ LinkID: 1, Provider: "PB", OrderID: "x" }]),
    });
    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledWith(
      "Client_SaveOrderBind",
      { orders: JSON.stringify([{ LinkID: 1, Provider: "PB", OrderID: "x" }]) },
      "",
      { errorTip: false },
    );
  });

  it("returns false when server rejects bind", async () => {
    post.mockResolvedValue({ success: 0, msg: "绑单失败" });
    const ok = await saveOrderBind({
      orders: JSON.stringify([{ LinkID: 1, Provider: "PB", OrderID: "x" }]),
    });
    expect(ok).toBe(false);
  });
});
