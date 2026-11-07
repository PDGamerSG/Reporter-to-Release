import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function constantEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ah = createHmac("sha256", "r2r-compare").update(a).digest();
  const bh = createHmac("sha256", "r2r-compare").update(b).digest();
  return timingSafeEqual(ah, bh);
}
export function verifyGithubSignature(raw: string, signature: string, secret: string): boolean {
  if (!secret || !/^sha256=[a-f\d]{64}$/.test(signature)) return false;
  return constantEqual(signature, `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`);
}
export function signValue(value: { id: string; expires: number }, secret: string): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function readSignedValue(value: string, secret: string): { id: string; expires: number } | null {
  try {
    const [payload, signature, extra] = value.split(".");
    if (extra || !signature || !constantEqual(signature, createHmac("sha256", secret).update(payload).digest("base64url"))) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof parsed.id === "string" && typeof parsed.expires === "number" && parsed.expires > Date.now() ? parsed : null;
  } catch { return null; }
}
let devSecret: string | undefined;
export function sessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) return process.env.SESSION_SECRET;
  if (process.env.VERCEL_ENV === "production") throw new Error("SESSION_SECRET must contain at least 32 characters in production.");
  return devSecret ??= randomBytes(32).toString("hex");
}
export function identity(platform: string, userId: string) { return createHmac("sha256", sessionSecret()).update(`${platform}:${userId}`).digest("hex"); }
