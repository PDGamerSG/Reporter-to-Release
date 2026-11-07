import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ fail: false, objects: [] as string[] }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    async send(command: { input: { Key: string }; kind: string }) {
      if (sent.fail) throw new Error("denied");
      sent.objects.push(command.input.Key);
      return {
        Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
      };
    }
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("@vercel/oidc-aws-credentials-provider", () => ({
  awsCredentialsProvider: () => async () => ({}),
}));

import { handleApi } from "@/lib/api";
import { imageType } from "@/lib/integrations/screenshots";
import { MemoryStore } from "@/lib/store";

const origin = "http://localhost:3000";
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function file(store: MemoryStore) {
  const response = await handleApi(
    new Request(`${origin}/api/intake`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Receipt preview stays blank",
        description: "After paying, the receipt preview is an empty white box.",
      }),
    }),
    ["intake"],
    store,
  );
  return (await response.json()) as { reportId: string; trackingToken: string };
}
const upload = (
  store: MemoryStore,
  id: string,
  token: string,
  body: Uint8Array<ArrayBuffer> = png,
) =>
  handleApi(
    new Request(`${origin}/api/track/${id}/screenshot`, {
      method: "POST",
      headers: { origin, "x-reporter-token": token },
      body,
    }),
    ["track", id, "screenshot"],
    store,
  );

describe("report screenshots", () => {
  beforeEach(() => {
    sent.fail = false;
    sent.objects = [];
    vi.stubEnv("SCREENSHOT_BUCKET", "bucket");
    vi.stubEnv("SCREENSHOT_ROLE_ARN", "arn:aws:iam::1:role/test");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("trusts file bytes and never accepts SVG or HTML", () => {
    expect(imageType(png)).toBe("image/png");
    expect(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg",
    );
    const encode = (text: string) => new TextEncoder().encode(text);
    expect(imageType(encode("RIFF0000WEBPVP8 "))).toBe("image/webp");
    expect(imageType(encode("<svg onload=alert(1)>"))).toBeUndefined();
    expect(imageType(encode("<html></html>"))).toBeUndefined();
  });

  it("stores a valid image under the report and caps each report at three", async () => {
    const store = new MemoryStore();
    const { reportId, trackingToken } = await file(store);
    for (let i = 0; i < 3; i += 1)
      expect((await upload(store, reportId, trackingToken)).status).toBe(201);
    expect((await upload(store, reportId, trackingToken)).status).toBe(409);
    expect(sent.objects).toHaveLength(3);
    expect(sent.objects[0]).toMatch(`reports/${reportId}/`);
    const { ledger } = await store.read("live");
    expect(ledger.reports[reportId].screenshots).toHaveLength(3);
  });

  it("refuses a wrong token, a non-image and an oversized file", async () => {
    const store = new MemoryStore();
    const { reportId, trackingToken } = await file(store);
    expect((await upload(store, reportId, "wrong")).status).toBe(403);
    const html = new TextEncoder().encode("<html>");
    expect((await upload(store, reportId, trackingToken, html)).status).toBe(
      415,
    );
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    big.set(png);
    expect((await upload(store, reportId, trackingToken, big)).status).toBe(
      415,
    );
    const declared = await handleApi(
      new Request(`${origin}/api/track/${reportId}/screenshot`, {
        method: "POST",
        headers: {
          origin,
          "x-reporter-token": trackingToken,
          "content-length": String(big.length),
        },
        body: png,
      }),
      ["track", reportId, "screenshot"],
      store,
    );
    expect(declared.status).toBe(413);
    expect(sent.objects).toHaveLength(0);
  });

  it("does not keep a record when storage fails", async () => {
    const store = new MemoryStore();
    const { reportId, trackingToken } = await file(store);
    sent.fail = true;
    expect((await upload(store, reportId, trackingToken)).status).toBe(503);
    expect(
      (await store.read("live")).ledger.reports[reportId].screenshots,
    ).toEqual([]);
  });

  it("is off without configuration and hidden from the public", async () => {
    const store = new MemoryStore();
    const { reportId, trackingToken } = await file(store);
    await upload(store, reportId, trackingToken);
    const read = await handleApi(
      new Request(`${origin}/api/reports/${reportId}/screenshots/0`),
      ["reports", reportId, "screenshots", "0"],
      store,
    );
    expect(read.status).toBe(403);
    vi.unstubAllEnvs();
    expect((await upload(store, reportId, trackingToken)).status).toBe(404);
  });
});
