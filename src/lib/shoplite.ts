/** A deliberately seeded regression, kept separate from the fixed calculation. */
export function calculateTotal(price: number, quantity: number, coupon: string, seededBug = false): number {
  if (!Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error("Use a valid price and a quantity between 1 and 99.");
  const subtotal = Math.round(price * 100) * quantity;
  const code = coupon.trim().toUpperCase();
  const discount = code === "SAVE300" ? 30000 : code === "WELCOME10" ? Math.round(subtotal * 0.1) : 0;
  const total = subtotal - discount;
  return (seededBug ? total : Math.max(0, total)) / 100;
}
