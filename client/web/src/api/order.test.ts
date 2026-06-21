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
    await saveOrderBind({ orders: "[]" });
    expect(post).not.toHaveBeenCalled();
  });

  it("pOSTs when binds array has rows", async () => {
    await saveOrderBind({
      orders: JSON.stringify([{ LinkID: 1, Provider: "PB", OrderID: "x" }]),
    });
    expect(post).toHaveBeenCalledWith("Client_SaveOrderBind", {
      orders: JSON.stringify([{ LinkID: 1, Provider: "PB", OrderID: "x" }]),
    });
  });
});
