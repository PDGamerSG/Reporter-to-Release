import { describe, expect, it } from "vitest";
import { calculateTotal } from "@/lib/shoplite";

describe("ShopLite coupon regression", () => {
  it("reproduces the seeded negative-total bug without changing the fixed path", () => {
    expect(calculateTotal(200, 1, "SAVE300", true)).toBe(-100);
    expect(calculateTotal(200, 1, "SAVE300", false)).toBe(0);
  });
  it("calculates undiscounted and percentage totals", () => {
    expect(calculateTotal(200, 2, "", false)).toBe(400);
    expect(calculateTotal(200, 2, "WELCOME10", false)).toBe(360);
  });
  it("rejects invalid prices and quantities", () => {
    expect(() => calculateTotal(-1, 1, "", false)).toThrow();
    expect(() => calculateTotal(200, 0, "", false)).toThrow();
  });
});
