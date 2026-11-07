import { afterEach, describe, expect, it, vi } from "vitest";
import { containsCommit } from "@/lib/integrations/github";

const base = "a".repeat(40);
const head = "b".repeat(40);

function stubGithub(status: number, body: unknown = {}) {
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

describe("containsCommit", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("accepts a head that is ahead of the base", async () => {
    stubGithub(200, { status: "ahead" });
    await expect(containsCommit("o/r", base, head)).resolves.toBe(true);
  });

  it("rejects a head that diverged from the base", async () => {
    stubGithub(200, { status: "diverged" });
    await expect(containsCommit("o/r", base, head)).resolves.toBe(false);
  });

  it("fails closed when GitHub no longer has a commit", async () => {
    stubGithub(404, { message: "Not Found" });
    await expect(containsCommit("o/r", base, head)).resolves.toBe(false);
  });

  it("still surfaces other GitHub failures", async () => {
    stubGithub(500);
    await expect(containsCommit("o/r", base, head)).rejects.toThrow(
      "GitHub returned HTTP 500.",
    );
  });
});
