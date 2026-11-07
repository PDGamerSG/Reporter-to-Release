import { describe, expect, it } from "vitest";
import { MemoryStore, mutate } from "@/lib/store";
import { intake } from "@/lib/domain/workflow";
import { claimJobs, acknowledgeJob } from "@/lib/domain/outbox";

describe("durable changes and notification delivery", () => {
  it("retries concurrent writes without losing either report", async () => {
    const store = new MemoryStore();
    await Promise.all(Array.from({ length: 12 }, (_, n) => mutate(store, "test", ledger => intake(ledger, { title: `Unique bug ${n}`, description: `Feature ${n} does not work.`, source: "web", reporterId: `person-${n}` }))));
    const state = (await store.read("test")).ledger;
    expect(Object.keys(state.reports)).toHaveLength(12);
    expect(state.revision).toBe(12);
  });

  it("does not persist a failed transition", async () => {
    const store = new MemoryStore();
    await expect(mutate(store, "test", ledger => { ledger.nextId = 99; throw new Error("rejected"); })).rejects.toThrow("rejected");
    expect((await store.read("test")).ledger.nextId).toBe(1);
  });

  it("leases jobs once, rejects foreign acknowledgements and retries failures", async () => {
    const store = new MemoryStore();
    await mutate(store, "test", ledger => intake(ledger, { title: "Cart crashes", description: "Cart crashes when opening.", source: "web", reporterId: "one" }));
    const first = await mutate(store, "test", ledger => claimJobs(ledger, 10));
    const second = await mutate(store, "test", ledger => claimJobs(ledger, 10));
    expect(first.length).toBeGreaterThan(0);
    expect(second).toHaveLength(0);
    await expect(mutate(store, "test", ledger => acknowledgeJob(ledger, first[0].id, "wrong-lease", true))).rejects.toThrow(/lease/i);
    await mutate(store, "test", ledger => acknowledgeJob(ledger, first[0].id, first[0].leaseId!, false, "Network timeout"));
    const failed = (await store.read("test")).ledger.outbox.find(j => j.id === first[0].id)!;
    expect(failed.sentAt).toBeUndefined();
    expect(failed.attempts).toBe(1);
    expect(Date.parse(failed.dueAt)).toBeGreaterThan(Date.now());
  });
});
