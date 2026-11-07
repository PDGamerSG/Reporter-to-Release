import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyGithubSignature, signValue, readSignedValue, constantEqual } from "@/lib/security";

describe("trust boundaries", () => {
  it("requires an authentic signature of the exact raw webhook body", () => {
    const body = '{"action":"closed"}';
    const signature = "sha256=" + createHmac("sha256", "test-secret").update(body).digest("hex");
    expect(verifyGithubSignature(body, signature, "test-secret")).toBe(true);
    expect(verifyGithubSignature(body + " ", signature, "test-secret")).toBe(false);
    expect(verifyGithubSignature(body, "", "test-secret")).toBe(false);
    expect(verifyGithubSignature(body, signature, "")).toBe(false);
  });

  it("rejects tampered and expired sessions", () => {
    const signed = signValue({ id: "one", expires: Date.now() + 60000 }, "secret");
    expect(readSignedValue(signed, "secret")?.id).toBe("one");
    expect(readSignedValue(signed + "x", "secret")).toBeNull();
    expect(readSignedValue(signValue({ id: "one", expires: 1 }, "secret"), "secret")).toBeNull();
  });

  it("does not accept empty credentials", () => {
    expect(constantEqual("", "")).toBe(false);
    expect(constantEqual("token", "token")).toBe(true);
    expect(constantEqual("token", "different")).toBe(false);
  });
});
