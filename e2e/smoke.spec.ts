import { expect, test } from "@playwright/test";

test("アプリが起動してrootが表示される", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#root")).toBeVisible();
});
