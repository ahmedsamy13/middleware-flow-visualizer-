import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  simulate,
  exampleConfig,
  createLayer,
  validateConfig,
  generateCode,
  matchPath,
  type Config,
  type Layer,
} from "../src/engine.ts";
import type { Request, Response, NextFunction } from "express";

async function compare(config: Config) {
  const app = express();
  const actual: {
    id: string;
    path: string;
    baseUrl: string;
    params: Record<string, string>;
  }[] = [];
  function fn(layer: Layer) {
    function run(req: Request, res: Response, next: NextFunction) {
      actual.push({
        id: layer.id,
        path: req.path,
        baseUrl: req.baseUrl,
        params: { ...req.params } as Record<string, string>,
      });
      if (layer.property) {
        let value: unknown;
        try {
          value = JSON.parse(layer.value);
        } catch {
          value = layer.value;
        }
        (req as unknown as Record<string, unknown>)[layer.property] = value;
      }
      switch (layer.action) {
        case "next":
          return next();
        case "respond":
          return res.status(layer.status).send(layer.message);
        case "error":
          return next(new Error(layer.message));
        case "reject":
          return Promise.reject(new Error(layer.message));
        case "route":
          return next("route");
        case "router":
          return next("router");
        case "pending":
          return;
      }
    }
    return layer.kind === "error"
      ? function (
          _err: unknown,
          req: Request,
          res: Response,
          next: NextFunction,
        ) {
          return run(req, res, next);
        }
      : function (req: Request, res: Response, next: NextFunction) {
          return run(req, res, next);
        };
  }
  function register(layers: Layer[], owner: express.Router) {
    for (const layer of layers) {
      if (!layer.enabled) continue;
      if (layer.kind === "router") {
        const router = express.Router();
        register(layer.children, router);
        owner.use(layer.path, router);
      } else if (layer.kind === "route") {
        const handlers = layer.children
          .filter((child) => child.enabled)
          .map(fn);
        (owner as unknown as Record<string, (...args: unknown[]) => void>)[
          layer.method.toLowerCase()
        ](layer.path, ...handlers);
      } else owner.use(layer.path, fn(layer));
    }
  }
  register(config.layers, app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const trace = simulate(config);
  const final = trace.at(-1)!;
  try {
    let status: number | undefined;
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}${new URL(config.url, "http://local").pathname}${new URL(config.url, "http://local").search}`,
        {
          method: config.method,
          signal: AbortSignal.timeout(final.outcome === "pending" ? 150 : 2000),
        },
      );
      status = response.status;
      await response.text();
    } catch (error) {
      if (final.outcome !== "pending") throw error;
    }
    assert.deepEqual(
      actual,
      trace
        .filter((frame) => frame.event === "run")
        .map((frame) => ({
          id: frame.id,
          path: frame.path,
          baseUrl: frame.baseUrl,
          params: frame.params,
        })),
    );
    if (final.outcome !== "pending") assert.equal(status, final.status);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  return trace;
}
for (const preset of ["logging", "error", "nested", "skip"])
  test(`Express 5 comparison: ${preset}`, async () => {
    await compare(exampleConfig(preset));
  });
test("response termination and unmatched methods produce expected results", async () => {
  const config = exampleConfig();
  config.method = "POST";
  const trace = await compare(config);
  assert.equal(trace.at(-1)?.status, 404);
  assert.ok(
    trace.some(
      (frame) => frame.event === "skip" && frame.reason.includes("Method"),
    ),
  );
});
test("router exit restores the parent path and skips router siblings", async () => {
  const config = exampleConfig("nested");
  const router = config.layers[0];
  const exit = createLayer("middleware", "Exit router");
  exit.action = "router";
  router.children.unshift(exit);
  const fallback = createLayer("middleware", "Fallback");
  fallback.action = "respond";
  config.layers.push(fallback);
  const trace = await compare(config);
  assert.ok(
    trace.some(
      (frame) =>
        frame.event === "run" &&
        frame.id === fallback.id &&
        frame.baseUrl === "",
    ),
  );
});
test("unhandled errors reach 500; error next() recovers normal flow", async () => {
  const config = exampleConfig("error");
  config.layers.pop();
  assert.equal((await compare(config)).at(-1)?.status, 500);
  const recovered = exampleConfig("error");
  const handler = recovered.layers.pop()!;
  handler.action = "next";
  recovered.layers.splice(2, 0, handler);
  assert.equal((await compare(recovered)).at(-1)?.status, 200);
});
test("pending handler leaves the real request pending", async () => {
  const config = exampleConfig();
  config.layers[0].action = "pending";
  assert.equal((await compare(config)).at(-1)?.outcome, "pending");
});
test("parameterized mounts use local paths, default case-insensitive matching and trailing slash", async () => {
  const router = createLayer("router", "Router");
  router.path = "/team/:team";
  const route = createLayer("route", "User");
  route.path = "/users/:id";
  const response = createLayer("middleware", "Response");
  response.action = "respond";
  route.children = [response];
  router.children = [route];
  const config: Config = {
    version: 1,
    method: "GET",
    url: "/TEAM/demo/users/42/?x=1",
    layers: [router],
  };
  const trace = await compare(config);
  assert.equal(trace.find((frame) => frame.event === "run")?.params.id, "42");
  assert.equal(matchPath("/api", "/apiary", false), null);
});
test("configuration validation protects names, paths and control-flow context", () => {
  const config = exampleConfig();
  config.layers[0].action = "route";
  assert.throws(() => validateConfig(config), /inside a route/);
  config.layers[0].action = "next";
  config.layers[0].property = "__proto__";
  assert.throws(() => validateConfig(config), /custom request property/);
  config.layers[0].property = "";
  config.layers[0].path = "/foo:bar";
  assert.throws(() => validateConfig(config), /Paths support/);
});
test("generated code uses four-argument error handlers and safe strings", () => {
  const config = exampleConfig("error");
  config.layers[0].value = '"hello"';
  const code = generateCode(config);
  assert.match(code, /\(err, req, res, next\)/);
  assert.match(code, /async \(req, res, next\)/);
  assert.match(code, /return next\(\)/);
});
