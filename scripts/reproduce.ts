import assert from "node:assert/strict";
import { calculateTotal } from "../src/lib/shoplite";
const buggy = !process.argv.includes("--fixed");
const total = calculateTotal(200, 1, "SAVE300", buggy);
console.log(`ShopLite ${buggy ? "seeded bug" : "fixed calculation"}: cart 200, coupon SAVE300, observed ${total}, expected 0`);
assert.equal(total, 0, "A coupon must never make the payable amount negative.");
console.log("PASS: payable amount is clamped at zero.");
