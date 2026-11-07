import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("queue search, evidence dialog, keyboard dismissal, and private demo isolation", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Interactive demo", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /R2R-0128.*Coupon/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Coupon makes the checkout total negative", {
      exact: true,
    }),
  ).toBeVisible();
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    accessibility.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await dialog.getByRole("button", { name: "Evidence", exact: true }).click();
  await expect(dialog.getByText(/Received: -100/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("textbox", { name: "Search bug reports" })
    .fill("no-such-report");
  await expect(page.getByText("No matching reports")).toBeVisible();
  const other = await browser.newContext();
  const response = await other.request.get(
    `${new URL(page.url()).origin}/api/workspace`,
  );
  const fresh = await response.json();
  expect(fresh.mode).toBe("demo");
  expect(fresh.clusters).toHaveLength(7);
  await other.close();
});

test("every workspace view and the public intake form render without accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("textbox", { name: "Search bug reports" }),
  ).toBeVisible();
  for (const name of [
    "Activity",
    "Releases",
    "Agent crew",
    "Airlock",
    "Connections",
    "Workflow guide",
  ]) {
    await page
      .getByRole("button", { name: new RegExp(`^${name}(?: \\d+)?$`) })
      .click();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        view: name,
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          message: n.failureSummary,
        })),
      })),
    ).toEqual([]);
  }
  await page.goto("/report?mode=demo");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
});

test("a demo report progresses through every guard to reporter verification", async ({
  page,
}) => {
  await page.goto("/report?mode=demo");
  const title = "Receipt preview turns blank";
  await page.getByLabel("What went wrong?").fill(title);
  await page
    .getByLabel("Walk us through it")
    .fill("Open the receipt preview after checkout. The receipt is blank.");
  await page.getByRole("button", { name: "Submit demo report" }).click();
  const tracking = await page
    .getByRole("link", { name: "Track your report" })
    .getAttribute("href");
  expect(tracking).toContain("#");
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(title) }).click();
  const dialog = page.getByRole("dialog");
  for (const name of [
    "Start example reproduction",
    "Record example failing test",
    "Simulate reporter confirmation",
    "Start example fix",
    "Record example pull request",
    "Record example human review",
    "Simulate human merge",
    "Simulate production deployment",
    "Simulate reporter verification",
  ]) {
    await dialog.getByRole("button", { name, exact: true }).click();
  }
  await expect(dialog.locator(".status-badge")).toHaveText("Verified");
  await page.keyboard.press("Escape");
  await page.goto(tracking!);
  await expect(
    page.getByText("You confirmed the live fix.", { exact: false }),
  ).toBeVisible();
});

test("ShopLite reproduces the actual coupon defect and fixed calculation", async ({
  page,
}) => {
  await page.goto("/shoplite");
  await page.getByLabel("Discount code").fill("SAVE300");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByTestId("payable-total")).toHaveText("−₹100");
  await page.getByRole("button", { name: "Fixed version" }).click();
  await expect(page.getByTestId("payable-total")).toHaveText("₹0");
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await expect(page.getByTestId("payable-total")).toHaveText("₹100");
});

test("a missing tracking capability is rejected without disclosing the report", async ({
  page,
}) => {
  await page.goto("/track/00000000-0000-4000-8000-000000000000");
  await expect(
    page.getByRole("alert").filter({ hasText: "tracking link is invalid" }),
  ).toBeVisible();
});

for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["mobile", 390, 844],
] as const) {
  test(`${name} dashboard is accessible and stays within the viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(
      page.getByRole("textbox", { name: "Search bug reports" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          message: n.failureSummary,
        })),
      })),
    ).toEqual([]);
    if (name === "mobile") {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page
        .getByRole("button", { name: "Connections", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Connect the whole journey." }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });
}
