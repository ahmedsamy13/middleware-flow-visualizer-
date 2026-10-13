import test from "node:test";
import assert from "node:assert/strict";
import { createLayer, simulate, flatten, type Config, type Layer } from "../src/engine.ts";
import { diagramLayers } from "../src/diagram.ts";

function fixture(): Config {
  function resource(name: string): Layer {
    const router = createLayer("router", `${name} router`);
    router.id = `${name}-router`;
    router.path = `/api/v1/${name}`;
    const route = createLayer("route", `GET ${name}`);
    route.id = `${name}-route`;
    const auth = createLayer("middleware", `${name} auth`);
    auth.id = `${name}-auth`;
    const send = createLayer("middleware", `${name} response`);
    send.id = `${name}-response`;
    send.action = "respond";
    route.children = [auth, send];
    router.children = [route];
    return router;
  }
  const logger = createLayer("middleware", "Logger");
  logger.id = "logger";
  const errors = createLayer("error", "Errors");
  errors.id = "errors";
  return { version: 1, method: "GET", url: "/api/v1/tours", layers: [logger, resource("users"), resource("tours"), resource("products"), errors] };
}
const ids = (layers: Layer[]) => layers.map((layer) => layer.id);

test("request view hides unrelated routes and retains executed mounts/handlers before playback", () => {
  const config = fixture();
  const original = structuredClone(config);
  const trace = simulate(config);
  assert.deepEqual(ids(diagramLayers(config.layers, trace, [], "request", false)), ["logger", "tours-router", "tours-route", "tours-auth", "tours-response"]);
  assert.deepEqual(ids(diagramLayers(config.layers, trace, [], "full", true)), ids(flatten(config.layers)));
  assert.deepEqual(config, original);
});

test("progressive view ignores skips, reveals entered contexts and resets to empty", () => {
  const config = fixture();
  const trace = simulate(config);
  assert.deepEqual(diagramLayers(config.layers, trace, [], "request", true), []);
  const skipped = trace.findIndex((frame) => frame.event === "skip");
  assert.deepEqual(ids(diagramLayers(config.layers, trace, trace.slice(0, skipped + 1), "request", true)), ["logger"]);
  const routeEntry = trace.findIndex((frame) => frame.id === "tours-route" && frame.event === "enter");
  assert.deepEqual(ids(diagramLayers(config.layers, trace, trace.slice(0, routeEntry + 1), "request", true)), ["logger", "tours-router", "tours-route"]);
  assert.deepEqual(diagramLayers(config.layers, trace, [], "request", true), []);
});

test("changing request method/path recalculates the visible execution path", () => {
  const config = fixture();
  config.url = "/api/v1/users";
  assert.deepEqual(ids(diagramLayers(config.layers, simulate(config), [], "request", false)), ["logger", "users-router", "users-route", "users-auth", "users-response"]);
  config.method = "POST";
  assert.deepEqual(ids(diagramLayers(config.layers, simulate(config), [], "request", false)), ["logger", "users-router"]);
  config.url = "/no-match";
  assert.deepEqual(ids(diagramLayers(config.layers, simulate(config), [], "request", false)), ["logger"]);
});

test("error/pending branches exclude later handlers and retain the actual error handler", () => {
  const config = fixture();
  const auth = config.layers[2].children[0].children[0];
  auth.action = "reject";
  assert.deepEqual(ids(diagramLayers(config.layers, simulate(config), [], "request", false)), ["logger", "tours-router", "tours-route", "tours-auth", "errors"]);
  auth.action = "pending";
  assert.deepEqual(ids(diagramLayers(config.layers, simulate(config), [], "request", false)), ["logger", "tours-router", "tours-route", "tours-auth"]);
  const trace = simulate(config);
  assert.equal(trace.at(-1)?.outcome, "pending");
});

test("route skipping preserves the entered route and reveals the fallback in execution order", () => {
  const config = fixture();
  const router = config.layers[2];
  router.children[0].children[0].action = "route";
  const fallback = createLayer("route", "Fallback");
  fallback.id = "fallback";
  const response = createLayer("middleware", "Fallback response");
  response.id = "fallback-response";
  response.action = "respond";
  fallback.children = [response];
  router.children.push(fallback);
  assert.deepEqual(ids(diagramLayers(config.layers, simulate(config), [], "request", false)), ["logger", "tours-router", "tours-route", "tours-auth", "fallback", "fallback-response"]);
});

test("an unmatched request with no global handlers yields an empty request diagram", () => {
  const config = fixture();
  config.layers.shift();
  config.url = "/missing";
  assert.equal(simulate(config).at(-1)?.status, 404);
  assert.deepEqual(diagramLayers(config.layers, simulate(config), [], "request", false), []);
});
