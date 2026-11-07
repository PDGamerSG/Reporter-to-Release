import { test, expect } from "@playwright/test";

// Traces record private form values and authenticated network traffic.
test.use({ trace: "off" });

test("owner sign-in opens live state and sign-out returns to the private demo", async ({
  page,
}) => {
  test.skip(
    !process.env.ADMIN_TOKEN,
    "An isolated server owner key is required",
  );
  await page.goto("/desk");
  await page
    .getByRole("button", { name: "Open live workspace", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Owner access key").fill(process.env.ADMIN_TOKEN!);
  await dialog
    .getByRole("button", { name: "Open live workspace", exact: true })
    .click();
  await expect(page.locator(".mode-badge")).toHaveText("Live workspace");
  await expect(page.locator(".demo-banner")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Workspace access", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Return to the demo", exact: true })
    .click();
  await expect(page.locator(".mode-badge")).toHaveText("Interactive demo");
});
