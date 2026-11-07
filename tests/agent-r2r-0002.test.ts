import { describe, expect, it } from "vitest";
import { calculateTotal } from "@/lib/shoplite";

describe("ShopLite large price", () => {
  it("rejects subtotal that cannot be safe integer cents", () => {
    expect(() => calculateTotal(1e308, 1, "", false)).toThrow();
  });
});
