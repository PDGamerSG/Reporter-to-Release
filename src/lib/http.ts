import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { digest } from "./domain/airlock";
import { DomainError } from "./domain/workflow";
import { readSignedValue, sessionSecret, signValue } from "./security";

export interface Context { key: string; mode: "demo" | "live"; id: string; cookie?: string }
export function cookieValue(request: Request, name: string): string {
  return request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}
export function context(request: Request): Context {
  const secret = sessionSecret();
  const owner = readSignedValue(cookieValue(request, "r2r_owner"), secret);
  if (owner?.id === "owner") return { key: "live", mode: "live", id: "owner" };
  const existing = readSignedValue(cookieValue(request, "r2r_demo"), secret);
  const id = existing?.id ?? randomUUID();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return { key: `demo:${digest(id)}`, mode: "demo", id, cookie: existing ? undefined : `r2r_demo=${signValue({ id, expires: Date.now() + 86400000 }, secret)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure}` };
}
export function json(value: unknown, status = 200, ctx?: Context) {
  const response = NextResponse.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  if (ctx?.cookie) response.headers.append("Set-Cookie", ctx.cookie);
  return response;
}
export function fail(error: unknown) {
  if (error instanceof DomainError) return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return json({ error: error.issues.map(i => `${i.path.join(".") || "Input"}: ${i.message}`).join("; ").slice(0, 600) }, 400);
  console.error("Request failed:", error instanceof Error ? error.name : "Unknown error");
  return json({ error: "The service could not complete this request. Try again shortly." }, 503);
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new DomainError("This action must come from the same website.", 403);
}
export async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new DomainError("Use application/json for this request.", 415);
  const raw = await boundedBody(request, 32768);
  try { return JSON.parse(raw); } catch { throw new DomainError("The request body must be valid JSON.", 400); }
}
export async function boundedBody(request: Request, max: number): Promise<string> {
  if (Number(request.headers.get("content-length") || 0) > max) throw new DomainError("Request is too large.", 413);
  if (!request.body) return "";
  const reader = request.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  while (true) {
    const next = await reader.read(); if (next.done) break;
    size += next.value.length;
    if (size > max) { await reader.cancel(); throw new DomainError("Request is too large.", 413); }
    parts.push(next.value);
  }
  return Buffer.concat(parts).toString("utf8");
}
