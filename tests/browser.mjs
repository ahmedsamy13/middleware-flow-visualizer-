import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_EXECUTABLE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5176/");
  await page.locator(".react-flow__node").first().waitFor();
  assert.equal(await page.locator(".react-flow__node").count(), 4);
  await page.getByRole("button", { name: "Step", exact: true }).click();
  assert.match(await page.getByRole("log").innerText(), /Request logger/);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.locator(".outcome-completed").waitFor();
  assert.match(await page.locator(".request-snapshot").innerText(), /200/);
  await page.getByRole("button", { name: "Reset execution" }).click();
  assert.match(await page.getByRole("log").innerText(), /Press Step/);
  await page.getByLabel("Example", { exact: true }).selectOption("nested");
  assert.equal(await page.locator(".react-flow__node").count(), 6);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.locator(".outcome-completed").waitFor();
  assert.match(
    await page.getByRole("log").innerText(),
    /local path.*\/v1\/users|local path.*\/users/,
  );
  await page.getByLabel("Example", { exact: true }).selectOption("error");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.locator(".outcome-failed").waitFor();
  await page
    .locator(".stack-row")
    .filter({ hasText: "Authentication" })
    .click();
  await page
    .getByLabel("Handler behavior", { exact: true })
    .selectOption("pending");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.locator(".outcome-pending").waitFor();
  await page.getByLabel("Example", { exact: true }).selectOption("logging");
  await page.getByRole("button", { name: "Middleware", exact: true }).click();
  assert.equal(await page.locator(".react-flow__node").count(), 5);
  await page.getByRole("button", { name: "Move layer up" }).click();
  await page.getByRole("button", { name: "Remove layer" }).click();
  assert.equal(await page.locator(".react-flow__node").count(), 4);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const config = JSON.parse(
    await fs.readFile(await (await downloadEvent).path(), "utf8"),
  );
  assert.equal(config.version, 1);
  await page.getByRole("button", { name: "Generated Express 5 code" }).click();
  assert.match(
    await page.getByLabel("Generated Express code").innerText(),
    /app\.get/,
  );
  await page.getByRole("button", { name: "Copy code", exact: true }).click();
  assert.match(await page.getByRole("status").innerText(), /copied/);
  await page.screenshot({
    path: "C:/Users/smsm/.codex/visualizations/2026/10/12/01a130e8-9056-77a0-a4b3-eed93424bd2c/middleware-flow.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Middleware browser checks passed: step/play/reset, nested routers, errors, pending, editor/add/reorder/delete, configuration export, generated code, copy and mobile layout.",
  );
} finally {
  await browser.close();
}
