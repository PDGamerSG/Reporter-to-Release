import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleApi } from "@/lib/api";
import { claimJobs } from "@/lib/domain/outbox";
import { presentWorkspace } from "@/lib/presentation";
import { MemoryStore } from "@/lib/store";

const origin = "http://localhost:3000";
const secret = "telegram-test-secret";
const chat = { id: 4242, type: "private" };

async function file(store: MemoryStore) {
  const response = await handleApi(
    new Request(`${origin}/api/intake`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Coupon makes the total negative",
        description:
          "I applied SAVE300 to a 200 cart and the total went negative.",
      }),
    }),
    ["intake"],
    store,
  );
  return (await response.json()) as { reportId: string; trackingToken: string };
}
const link = (store: MemoryStore, id: string, token: string) =>
  handleApi(
    new Request(`${origin}/api/track/${id}/telegram`, {
      method: "POST",
      headers: { origin, "x-reporter-token": token },
    }),
    ["track", id, "telegram"],
    store,
  );
const bot = (store: MemoryStore, text: string, token = secret) =>
  handleApi(
    new Request(`${origin}/api/telegram/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": token,
      },
      body: JSON.stringify({ message: { text, chat } }),
    }),
    ["telegram", "webhook"],
    store,
  );

describe("Telegram updates", () => {
  beforeEach(() => {
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "test_bot");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", secret);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("links a chat, routes reporter jobs to it and keeps the chat private", async () => {
    const store = new MemoryStore();
    const { reportId, trackingToken } = await file(store);
    const { url } = await (await link(store, reportId, trackingToken)).json();
    expect(url).toMatch(/^https:\/\/t\.me\/test_bot\?start=[\w-]{24}$/);
    const reply = await (
      await bot(store, `/start ${new URL(url).searchParams.get("start")}`)
    ).json();
    expect(reply).toMatchObject({ method: "sendMessage", chat_id: chat.id });
    expect(reply.text).toContain("You will get updates for");
    const { ledger } = await store.read("live");
    expect(ledger.reports[reportId].telegram?.chatId).toBe(chat.id);
    expect(ledger.reports[reportId].telegramLink).toBeUndefined();
    const jobs = claimJobs(ledger, 25);
    expect(jobs.find((job) => job.channel === "reporter")?.telegramChatId).toBe(
      chat.id,
    );
    expect(
      jobs.find((job) => job.channel === "engineering")?.telegramChatId,
    ).toBeUndefined();
    expect(JSON.stringify(presentWorkspace(ledger, "live"))).not.toContain(
      String(chat.id),
    );
  });

  it("refuses a wrong secret, a wrong token and an expired code", async () => {
    const store = new MemoryStore();
    const { reportId, trackingToken } = await file(store);
    expect((await bot(store, "/status", "wrong")).status).toBe(404);
    expect((await link(store, reportId, "wrong")).status).toBe(403);
    const { url } = await (await link(store, reportId, trackingToken)).json();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 16 * 60000);
    const reply = await (
      await bot(store, `/start ${new URL(url).searchParams.get("start")}`)
    ).json();
    expect(reply.text).toContain("expired");
    expect(
      (await store.read("live")).ledger.reports[reportId].telegram,
    ).toBeUndefined();
  });

  it("reports status and stops on request", async () => {
    const store = new MemoryStore();
    const { reportId, trackingToken } = await file(store);
    const { url } = await (await link(store, reportId, trackingToken)).json();
    await bot(store, `/start ${new URL(url).searchParams.get("start")}`);
    expect((await (await bot(store, "/status")).json()).text).toContain("new");
    await bot(store, "/stop");
    expect(
      (await store.read("live")).ledger.reports[reportId].telegram,
    ).toBeUndefined();
    expect((await (await bot(store, "/status")).json()).text).toContain(
      "No reports",
    );
  });

  it("ignores group chats and is off without configuration", async () => {
    const store = new MemoryStore();
    const group = await handleApi(
      new Request(`${origin}/api/telegram/webhook`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": secret,
        },
        body: JSON.stringify({
          message: { text: "/status", chat: { id: 1, type: "group" } },
        }),
      }),
      ["telegram", "webhook"],
      store,
    );
    expect(await group.json()).toEqual({});
    vi.unstubAllEnvs();
    expect((await bot(store, "/status", "")).status).toBe(404);
    const { reportId, trackingToken } = await file(store);
    expect((await link(store, reportId, trackingToken)).status).toBe(404);
  });
});
