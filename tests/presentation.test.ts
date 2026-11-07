import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptyLedger } from "@/lib/domain/workflow";
import { presentWorkspace } from "@/lib/presentation";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T15:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

it("keeps existing ledgers usable while engineering has not reported in", () => {
  const workspace = presentWorkspace(emptyLedger(), "live");
  expect(workspace.engineering).toBeNull();
  expect(
    workspace.integrations.find((i) => i.id === "engineering")?.status,
  ).toBe("disconnected");
});

it.each([
  ["2026-11-07T14:59:59.000Z", 4, true, true, 4],
  ["2026-11-07T14:58:30.001Z", 4, true, true, 4],
  ["2026-11-07T14:58:30.000Z", 4, false, false, 0],
  ["2026-11-07T15:00:01.000Z", 4, false, false, 0],
  ["invalid", 4, false, false, 0],
  ["2026-11-07T14:59:59.000Z", 3, true, false, 3],
  ["2026-11-07T14:59:59.000Z", 0, true, false, 0],
])(
  "derives liveness from timestamp %s and %i role connections",
  (at, roomsConnected, fresh, connected, visibleRooms) => {
    const ledger = emptyLedger();
    ledger.engineeringHeartbeat = {
      at,
      roomsConnected,
      provider: "meta",
      model: "muse-spark-1.3",
      version: "1.1.0",
    };
    const workspace = presentWorkspace(ledger, "live");
    expect(workspace.engineering).toMatchObject({
      fresh,
      connected,
      roomsConnected: visibleRooms,
      provider: "meta",
      model: "muse-spark-1.3",
      lastSeenAt: at,
    });
    expect(
      workspace.integrations.find((i) => i.id === "engineering")?.status,
    ).toBe(connected ? "connected" : "disconnected");
  },
);

it("never presents a live engineering heartbeat as demonstration evidence", () => {
  const ledger = emptyLedger();
  ledger.engineeringHeartbeat = {
    at: "2026-11-07T14:59:59.000Z",
    roomsConnected: 4,
    provider: "bedrock",
    model: "private-configured-model",
    version: "1.1.0",
  };
  const workspace = presentWorkspace(ledger, "demo");
  expect(workspace.engineering).toBeNull();
  const integration = workspace.integrations.find(
    (i) => i.id === "engineering",
  );
  expect(integration?.status).toBe("demo");
  expect(JSON.stringify(integration)).not.toContain("private-configured-model");
});
