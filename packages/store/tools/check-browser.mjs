import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const origin = process.env.STORE_ORIGIN ?? "http://localhost:3001";
const screenshots = new URL("../.data/preview/", import.meta.url);
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.platform === "win32" ? { channel: "msedge" } : {}),
});
const errors = [];
let currentPage;
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  currentPage = page;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.screenshot({
    path: fileURLToPath(new URL("home-desktop.png", screenshots)),
    fullPage: true,
  });
  assert.equal(
    await page.locator("h1").innerText(),
    "Small tools.\nGood beginnings.",
  );

  if (!process.argv.includes("--skip-partials")) {
    await page.goto(`${origin}/products`);
    await page.evaluate(() => {
      window.__storeNavigationMarker = "same-document";
    });
    await page.locator("select[name=category]").selectOption("Guides");
    await page.getByRole("button", { name: "Find your thing" }).click();
    await page.waitForURL(/category=Guides/);
    assert.equal(await page.locator(".product-card").count(), 1);
    assert.equal(
      await page.evaluate(() => window.__storeNavigationMarker),
      "same-document",
    );
    await page.goBack();
    await page.waitForFunction(
      () => document.querySelectorAll(".product-card").length === 2,
    );
  }

  await page.goto(`${origin}/products/launch-kit`);
  // Hum only activates this island near the viewport; scroll before exercising shared state.
  await page.locator(".purchase-total").scrollIntoViewIfNeeded();
  await page.locator("#quantity").fill("3");
  await page.waitForFunction(
    () =>
      document.querySelector(".purchase-total strong")?.textContent ===
      "$87.00",
  );
  await page.screenshot({
    path: fileURLToPath(new URL("product-desktop.png", screenshots)),
    fullPage: true,
  });

  await page.goto(`${origin}/login?mode=register`);
  await page.locator("#name").fill("Store QA");
  await page.locator("#email").fill(`qa-${Date.now()}@example.invalid`);
  await page.locator("#password").fill("qa-password-for-local-testing-123");
  await page.getByRole("button", { name: "Create your account" }).click();
  await page.waitForURL(`${origin}/account`);
  assert.match(await page.locator("h1").innerText(), /Store/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(`${origin}/`);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: fileURLToPath(new URL("home-mobile.png", screenshots)),
    fullPage: true,
  });

  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const plain = await noJs.newPage();
  await plain.goto(`${origin}/products?category=Guides`);
  assert.equal(await plain.locator(".product-card").count(), 1);
  await plain.goto(`${origin}/products/launch-kit`);
  assert.equal(await plain.locator("#quantity").inputValue(), "1");
  await plain.getByRole("button", { name: "Make it yours" }).click();
  await plain.waitForURL(/\/login\?returnTo=/);
  await noJs.close();
  assert.deepEqual(errors, []);
  console.log(
    `Browser checks passed: ${process.argv.includes("--skip-partials") ? "partial checks skipped; " : "partial navigation/history; "}shared signals, authentication, mobile width, and no-JavaScript forms.`,
  );
  console.log("Screenshots saved to packages/store/.data/preview/.");
} catch (error) {
  if (currentPage) {
    console.error(
      JSON.stringify({
        url: currentPage.url(),
        errors,
        title: await currentPage.title(),
      }),
    );
    await currentPage.screenshot({
      path: fileURLToPath(new URL("failure.png", screenshots)),
      fullPage: true,
    });
  }
  throw error;
} finally {
  await browser.close();
}
