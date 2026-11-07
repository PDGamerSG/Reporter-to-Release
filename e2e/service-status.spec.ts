import { test, expect, type Page } from "@playwright/test";

test.use({ trace: "off" });
test.beforeEach(async ({ request, baseURL }) => {
  test.skip(
    !process.env.ADMIN_TOKEN || !process.env.ENGINEERING_TOKEN,
    "Isolated owner and engineering keys are required",
  );
  test.skip(
    !baseURL ||
      !["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname),
    "Service heartbeat fixtures run only on a loopback test server",
  );
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  test.skip(
    (await health.json()).storage !== "local",
    "Service heartbeat fixtures require local isolated storage",
  );
});

async function heartbeat(page: Page, roomsConnected: number) {
  const response = await page.request.post("/api/engineering/heartbeat", {
    headers: { Authorization: `Bearer ${process.env.ENGINEERING_TOKEN}` },
    data: {
      roomsConnected,
      provider: "meta",
      model: "muse-spark-1.3",
      version: "1.1.0",
    },
  });
  expect(response.status()).toBe(200);
}

test("demo crew stays illustrative when the live engineering service is connected", async ({
  page,
}) => {
  await heartbeat(page, 4);
  await page.goto("/desk");
  await page.getByRole("button", { name: "Agent crew", exact: true }).click();
  await expect(page.getByText("Example role", { exact: true })).toHaveCount(3);
  await expect(page.getByText(/Meta \/ muse-spark/)).toHaveCount(0);
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  const service = page.locator(".connection-card").filter({
    has: page.getByRole("heading", { name: "AWS engineering service" }),
  });
  await expect(service.locator(".connection-status")).toHaveText("demo");
});

test("live crew and connections follow actual partial and healthy service heartbeats", async ({
  page,
}) => {
  await heartbeat(page, 2);
  await page.goto("/desk");
  const response = await page.request.post("/api/auth", {
    headers: { Origin: new URL(page.url()).origin },
    data: { token: process.env.ADMIN_TOKEN },
  });
  expect(response.status()).toBe(200);
  await page.reload();
  await expect(page.locator(".mode-badge")).toHaveText("Live workspace");
  await page.getByRole("button", { name: "Agent crew", exact: true }).click();
  await expect(page.locator(".info-banner")).toContainText(
    "2 of 4 engineering role connections",
  );
  await expect(
    page.locator(".vendor-label").filter({ hasText: "Meta / muse-spark-1.3" }),
  ).toHaveCount(3);
  await expect(
    page.locator(".vendor-label").filter({ hasText: "Python orchestration" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  const service = page.locator(".connection-card").filter({
    has: page.getByRole("heading", { name: "AWS engineering service" }),
  });
  await expect(service.locator(".connection-status")).toHaveText(
    "disconnected",
  );
  await expect(service).toContainText("2 of 4 role connections");
  await heartbeat(page, 4);
  await page.getByRole("button", { name: "Refresh workspace" }).click();
  await expect(service.locator(".connection-status")).toHaveText("connected");
  await expect(service).toContainText("4 of 4 role connections");
  await page.getByRole("button", { name: "Agent crew", exact: true }).click();
  await expect(page.locator(".info-banner")).toContainText(
    "4 of 4 engineering role connections",
  );
});
