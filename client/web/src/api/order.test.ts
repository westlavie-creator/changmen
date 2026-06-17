import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn());

vi.mock("@/api/client", () => ({
  post,
  unwrap: (x: unknown) => x,
}));

import { saveOrderBind } from "@/api/order";

describe("saveOrderBind", () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({ success: 1 });
  });

  it("skips POST when binds array is empty (A8 Vt.saveOrderBind)", async () => {
    await saveOrderBind({ orders: "[]" });
    expect(post).not.toHaveBeenCalled();
  });

  it("POSTs when binds array has rows", async () => {
    await saveOrderBind({
      orders: JSON.stringify([{ LinkID: 1, Provider: "PB", OrderID: "x" }]),
    });
    expect(post).toHaveBeenCalledWith("Client_SaveOrderBind", {
      orders: JSON.stringify([{ LinkID: 1, Provider: "PB", OrderID: "x" }]),
    });
  });
});
