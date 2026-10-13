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
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5176/");
  await page.locator(".react-flow__node").first().waitFor();
  assert.equal(await page.locator(".react-flow__node").count(), 3);
  assert.equal(await page.getByRole("button", { name: "Request path only", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "Full stack", exact: true }).click();
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
  await page.getByRole("status").filter({ hasText: "Express code copied." }).waitFor();
  assert.match(await page.getByRole("status").innerText(), /copied/);
  const makeLayer = (id, kind, children = [], overrides = {}) => ({
    id, name: id, kind, path: "/", method: "GET", action: "next", status: 200,
    message: "OK", property: "", value: "", enabled: true, children, ...overrides,
  });
  const resource = (name) => makeLayer(`${name}-router`, "router", [
    makeLayer(`${name}-route`, "route", [
      makeLayer(`${name}-auth`, "middleware"),
      makeLayer(`${name}-response`, "middleware", [], { action: "respond" }),
    ]),
  ], { path: `/api/v1/${name}` });
  const combined = { version: 1, method: "GET", url: "/api/v1/tours", layers: [
    makeLayer("request-logger", "middleware"), resource("users"), resource("tours"), resource("products"),
    makeLayer("error-handler", "error", [], { action: "respond", status: 500 }),
  ] };
  await page.locator('input[type="file"]').setInputFiles({ name: "routes.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(combined)) });
  assert.equal(await page.locator(".react-flow__node").count(), 14);
  await page.getByRole("button", { name: "Request path only", exact: true }).click();
  assert.equal(await page.locator(".react-flow__node").count(), 5);
  assert.equal(await page.locator('.react-flow__node[data-id="users-router"]').count(), 0);
  assert.equal(await page.locator('.react-flow__node[data-id="products-router"]').count(), 0);
  assert.equal(await page.locator('.react-flow__node[data-id="error-handler"]').count(), 0);
  await page.getByLabel("Reveal as you step").check();
  assert.equal(await page.locator(".react-flow__node").count(), 0);
  await page.getByText("Press Step or Play to reveal the request path.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Step", exact: true }).click();
  assert.equal(await page.locator(".react-flow__node").count(), 1);
  await page.getByRole("button", { name: "Step", exact: true }).click();
  assert.equal(await page.locator(".react-flow__node").count(), 1);
  assert.match(await page.getByRole("log").innerText(), /does not match/);
  await page.getByLabel("Reveal as you step").uncheck();
  assert.equal(await page.locator(".react-flow__node").count(), 5);
  await page.getByRole("button", { name: "Full stack", exact: true }).click();
  assert.equal(await page.locator(".react-flow__node").count(), 14);
  await page.getByRole("button", { name: "Request path only", exact: true }).click();
  await page.getByRole("button", { name: "Reset execution" }).click();
  assert.equal(await page.locator(".react-flow__node").count(), 5);
  await page.getByLabel("Playback speed").selectOption("300");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.locator(".outcome-completed").waitFor({ timeout: 15000 });
  assert.equal(await page.locator(".flow-node.state-skipped").count(), 0);
  assert.ok(await page.locator(".flow-node.state-visited").count() > 0);
  await page.getByLabel("Request URL").fill("/api/v1/users");
  await page.locator('.react-flow__node[data-id="users-response"]').waitFor();
  assert.equal(await page.locator('.react-flow__node[data-id="tours-router"]').count(), 0);
  await page.getByLabel("Request URL").fill("/api/v1/tours");
  await page.locator('.react-flow__node[data-id="tours-auth"]').click();
  await page.getByLabel("Handler behavior", { exact: true }).selectOption("reject");
  await page.locator('.react-flow__node[data-id="error-handler"]').waitFor();
  assert.equal(await page.locator('.react-flow__node[data-id="tours-response"]').count(), 0);
  await page.getByLabel("Handler behavior", { exact: true }).selectOption("pending");
  assert.equal(await page.locator('.react-flow__node[data-id="error-handler"]').count(), 0);
  await page.getByLabel("Handler behavior", { exact: true }).selectOption("next");
  const focusedDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const fullExport = JSON.parse(await fs.readFile(await (await focusedDownload).path(), "utf8"));
  assert.deepEqual(fullExport, combined);
  assert.match(await page.getByLabel("Generated Express code").innerText(), /api\/v1\/products/);
  await page.screenshot({
    path: "C:/Users/smsm/.codex/visualizations/2026/10/12/01a130e8-9056-77a0-a4b3-eed93424bd2c/middleware-flow.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Full stack", exact: true }).click();
  assert.equal(await page.locator(".react-flow__node").count(), 14);
  await page.getByRole("button", { name: "Request path only", exact: true }).click();
  assert.equal(await page.locator(".react-flow__node").count(), 5);
  await page.getByLabel("Reveal as you step").check();
  await page.getByRole("button", { name: "Reset execution" }).click();
  assert.equal(await page.locator(".react-flow__node").count(), 0);
  await page.getByLabel("Reveal as you step").uncheck();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Middleware browser checks passed: request/full views, progressive reveal/reset, route changes, errors/pending, full configuration export, playback, nested routers, editor, generated code, clipboard and mobile layout.",
  );
} finally {
  await browser.close();
}
