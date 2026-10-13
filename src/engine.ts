export type Action =
  "next" | "respond" | "error" | "route" | "router" | "reject" | "pending";
export type Kind = "middleware" | "error" | "route" | "router";
export interface Layer {
  id: string;
  name: string;
  kind: Kind;
  path: string;
  method: string;
  action: Action;
  status: number;
  message: string;
  property: string;
  value: string;
  enabled: boolean;
  children: Layer[];
}
export interface Config {
  version: 1;
  method: string;
  url: string;
  layers: Layer[];
}
export type Outcome =
  "running" | "completed" | "failed" | "pending" | "not-found";
export interface Frame {
  id?: string;
  name: string;
  event: "run" | "skip" | "enter" | "exit" | "finish";
  reason: string;
  path: string;
  baseUrl: string;
  params: Record<string, string>;
  properties: Record<string, unknown>;
  error: string | null;
  outcome: Outcome;
  status?: number;
  response?: string;
}
export interface Context {
  path: string;
  baseUrl: string;
  params: Record<string, string>;
}
const methods = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "ALL",
];
const actions: Action[] = [
  "next",
  "respond",
  "error",
  "route",
  "router",
  "reject",
  "pending",
];
const kinds: Kind[] = ["middleware", "error", "route", "router"];
const safeProperty = /^[A-Za-z_$][\w$]*$/;
const prohibited = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "url",
  "originalUrl",
  "baseUrl",
  "path",
  "params",
  "method",
  "query",
  "headers",
  "body",
]);
export function createLayer(
  kind: Kind = "middleware",
  name = "Middleware",
): Layer {
  return {
    id: crypto.randomUUID(),
    name,
    kind,
    path: "/",
    method: "GET",
    action: kind === "error" ? "respond" : "next",
    status: kind === "error" ? 500 : 200,
    message: kind === "error" ? "Request failed" : "OK",
    property: "",
    value: "",
    enabled: true,
    children: [],
  };
}
export function validateConfig(value: unknown): Config {
  if (!value || typeof value !== "object")
    throw new Error("Configuration must be a JSON object.");
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1 || !Array.isArray(raw.layers))
    throw new Error("Use a version 1 configuration with a layers array.");
  if (
    typeof raw.method !== "string" ||
    !methods.slice(0, -1).includes(raw.method)
  )
    throw new Error("Choose a supported request method.");
  if (
    typeof raw.url !== "string" ||
    raw.url.length > 1000 ||
    (!raw.url.startsWith("/") && !/^https?:\/\//.test(raw.url))
  )
    throw new Error(
      "Request URL must be a path beginning with / or an HTTP(S) URL.",
    );
  try {
    decodeURI(new URL(raw.url, "http://simulation.local").pathname);
  } catch {
    throw new Error("Request URL contains invalid encoding.");
  }
  const ids = new Set<string>();
  let count = 0;
  function layer(
    value: unknown,
    depth: number,
    inRouter: boolean,
    inRoute: boolean,
  ): Layer {
    if (depth > 8 || ++count > 80)
      throw new Error("Use at most 80 layers and 8 nested levels.");
    if (!value || typeof value !== "object")
      throw new Error("Every layer must be an object.");
    const item = value as Record<string, unknown>;
    if (
      typeof item.id !== "string" ||
      !/^[\w-]{1,80}$/.test(item.id) ||
      ids.has(item.id)
    )
      throw new Error(
        "Layer IDs must be unique and contain only letters, numbers, underscores or dashes.",
      );
    ids.add(item.id);
    if (
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 80
    )
      throw new Error("Layer names need 1–80 characters.");
    if (
      !kinds.includes(item.kind as Kind) ||
      !actions.includes(item.action as Action)
    )
      throw new Error("Unknown layer kind or action.");
    if (
      typeof item.path !== "string" ||
      !item.path.startsWith("/") ||
      item.path.length > 200 ||
      !item.path
        .split("/")
        .slice(1)
        .every(
          (segment) =>
            segment === "" ||
            /^[A-Za-z0-9_~.%-]+$/.test(segment) ||
            /^:[A-Za-z_][\w]*$/.test(segment),
        )
    )
      throw new Error(
        "Paths support literal segments and :name parameters only. Wildcards, regex, optional segments and query strings are unsupported.",
      );
    if (typeof item.method !== "string" || !methods.includes(item.method))
      throw new Error("Invalid route method.");
    if (
      typeof item.status !== "number" ||
      !Number.isInteger(item.status) ||
      item.status < 200 ||
      item.status > 599
    )
      throw new Error(
        "Simulated responses use final status codes from 200 to 599.",
      );
    if (
      typeof item.message !== "string" ||
      item.message.length > 1000 ||
      typeof item.property !== "string" ||
      typeof item.value !== "string" ||
      item.value.length > 2000 ||
      typeof item.enabled !== "boolean" ||
      !Array.isArray(item.children)
    )
      throw new Error("Invalid layer fields.");
    if (
      item.property &&
      (!safeProperty.test(item.property) || prohibited.has(item.property))
    )
      throw new Error(
        "Use a custom request property name; built-in and prototype properties cannot be overwritten.",
      );
    if (inRoute && (item.kind === "router" || item.kind === "route"))
      throw new Error(
        "Routes may contain handlers or error handlers, not nested routes/routers.",
      );
    if (item.kind !== "router" && item.kind !== "route" && item.children.length)
      throw new Error("Only routers and routes may contain child layers.");
    if (item.kind === "route" && !item.children.length)
      throw new Error("A route needs at least one handler.");
    if (
      item.kind !== "router" &&
      item.kind !== "route" &&
      item.action === "route" &&
      !inRoute
    )
      throw new Error(
        "next('route') is only available inside a route's handler stack.",
      );
    if (
      item.kind !== "router" &&
      item.kind !== "route" &&
      item.action === "router" &&
      !inRouter
    )
      throw new Error("next('router') is only available inside a router.");
    return {
      id: item.id,
      name: item.name,
      kind: item.kind as Kind,
      path: item.path,
      method: item.method,
      action: item.action as Action,
      status: item.status,
      message: item.message,
      property: item.property,
      value: item.value,
      enabled: item.enabled,
      children: item.children.map((child) =>
        layer(
          child,
          depth + 1,
          inRouter || item.kind === "router",
          inRoute || item.kind === "route",
        ),
      ),
    };
  }
  return {
    version: 1,
    method: raw.method,
    url: raw.url,
    layers: raw.layers.map((item) => layer(item, 0, false, false)),
  };
}
export function matchPath(
  pattern: string,
  path: string,
  end: boolean,
): { consumed: string; params: Record<string, string> } | null {
  const params: Record<string, string> = {};
  const normalized = pattern.length > 1 ? pattern.replace(/\/$/, "") : pattern;
  const names: string[] = [];
  const source = normalized
    .split("/")
    .map((segment) =>
      segment.startsWith(":")
        ? (names.push(segment.slice(1)), "([^/]+)")
        : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("/");
  const regex = new RegExp(
    "^" +
      (normalized === "/" && !end ? "" : source) +
      (end ? "/?$" : "(?=/|$)"),
    "i",
  );
  const match = path.match(regex);
  if (!match) return null;
  names.forEach(
    (name, index) => (params[name] = decodeURIComponent(match[index + 1])),
  );
  return {
    consumed: normalized === "/" && !end ? "" : match[0].replace(/\/$/, ""),
    params,
  };
}
export function simulate(input: Config): Frame[] {
  const config = validateConfig(input);
  const frames: Frame[] = [];
  const properties: Record<string, unknown> = Object.create(null);
  const path = new URL(config.url, "http://simulation.local").pathname;
  let error: string | null = null;
  let terminal: Outcome = "running";
  let responseStatus: number | undefined;
  let responseBody: string | undefined;
  function record(
    event: Frame["event"],
    layer: Layer | undefined,
    reason: string,
    context: Context,
  ) {
    frames.push({
      id: layer?.id,
      name: layer?.name ?? "Express final handler",
      event,
      reason,
      path: context.path,
      baseUrl: context.baseUrl,
      params: { ...context.params },
      properties: structuredClone(properties),
      error,
      outcome: terminal,
      status: responseStatus,
      response: responseBody,
    });
  }
  function skipTree(layer: Layer, reason: string, context: Context) {
    record("skip", layer, reason, context);
    layer.children.forEach((child) => skipTree(child, reason, context));
  }
  function walk(
    layers: Layer[],
    context: Context,
    insideRoute = false,
  ): "continue" | "route" | "router" | "terminal" {
    for (let index = 0; index < layers.length; index++) {
      const layer = layers[index];
      if (!layer.enabled) {
        skipTree(layer, "Disabled in this configuration.", context);
        continue;
      }
      const match = insideRoute
        ? { consumed: "", params: context.params }
        : matchPath(layer.path, context.path, layer.kind === "route");
      if (!match) {
        skipTree(
          layer,
          `Path ${context.path} does not match ${layer.path}.`,
          context,
        );
        continue;
      }
      if (
        layer.kind === "route" &&
        (error ||
          (layer.method !== "ALL" &&
            layer.method !== config.method &&
            !(config.method === "HEAD" && layer.method === "GET")))
      ) {
        skipTree(
          layer,
          error
            ? "Incoming error bypasses route registration."
            : `Method ${config.method} does not match ${layer.method}.`,
          context,
        );
        continue;
      }
      if (layer.kind === "router" || layer.kind === "route") {
        const childContext =
          layer.kind === "router"
            ? {
                path: context.path.slice(match.consumed.length) || "/",
                baseUrl: context.baseUrl + match.consumed,
                params: {},
              }
            : { ...context, params: match.params };
        record(
          "enter",
          layer,
          layer.kind === "router"
            ? `Enter router at ${layer.path}; local path is ${childContext.path}.`
            : `Matched ${layer.method} ${layer.path}.`,
          childContext,
        );
        const control = walk(
          layer.children,
          childContext,
          layer.kind === "route",
        );
        if (control === "terminal") {
          layers
            .slice(index + 1)
            .forEach((next) =>
              skipTree(
                next,
                "Request has already ended or remains pending.",
                context,
              ),
            );
          return control;
        }
        if (control === "router" && layer.kind === "route") {
          layers
            .slice(index + 1)
            .forEach((next) =>
              skipTree(next, "Skipped by next('router').", context),
            );
          return "router";
        }
        if (control === "router") {
          error = null;
          record(
            "exit",
            layer,
            "next('router') exits this router; parent stack resumes.",
            context,
          );
        } else
          record(
            "exit",
            layer,
            control === "route"
              ? "next('route') skips the rest of this route; next registration resumes."
              : "Handler stack exhausted; parent stack resumes.",
            context,
          );
        continue;
      }
      if (layer.kind === "error" && !error) {
        record(
          "skip",
          layer,
          "No active error; error handler is skipped.",
          context,
        );
        continue;
      }
      if (layer.kind !== "error" && error) {
        record(
          "skip",
          layer,
          "An active error skips normal middleware.",
          context,
        );
        continue;
      }
      const local = insideRoute
        ? context
        : {
            path: context.path.slice(match.consumed.length) || "/",
            baseUrl: context.baseUrl + match.consumed,
            params: match.params,
          };
      if (layer.property) {
        try {
          properties[layer.property] = JSON.parse(layer.value);
        } catch {
          properties[layer.property] = layer.value;
        }
      }
      let reason = "";
      switch (layer.action) {
        case "next":
          error = null;
          reason = "next() transfers control to the next eligible handler.";
          break;
        case "error":
          error = layer.message || "Middleware error";
          reason = `next(error): ${error}`;
          break;
        case "reject":
          error = layer.message || "Rejected promise";
          reason = `Express 5 forwards the rejected promise as an error: ${error}`;
          break;
        case "respond":
          terminal = layer.status >= 400 ? "failed" : "completed";
          responseStatus = layer.status;
          responseBody = layer.message;
          reason = `Response sent (${layer.status}); request ends.`;
          break;
        case "pending":
          terminal = "pending";
          reason = "No response and no next(): request remains pending.";
          break;
        case "route":
          error = null;
          reason =
            "next('route') skips remaining handlers in the current route.";
          break;
        case "router":
          error = null;
          reason = "next('router') exits the current router.";
          break;
      }
      record("run", layer, reason, local);
      if (terminal !== "running") {
        layers
          .slice(index + 1)
          .forEach((next) =>
            skipTree(
              next,
              "Request has already ended or remains pending.",
              context,
            ),
          );
        return "terminal";
      }
      if (layer.action === "route" || layer.action === "router") {
        layers
          .slice(index + 1)
          .forEach((next) =>
            skipTree(
              next,
              layer.action === "route"
                ? "Skipped by next('route')."
                : "Skipped by next('router').",
              context,
            ),
          );
        return layer.action;
      }
    }
    return "continue";
  }
  const root = { path, baseUrl: "", params: {} };
  walk(config.layers, root);
  if (terminal === "running") {
    terminal = error ? "failed" : "not-found";
    responseStatus = error ? 500 : 404;
    responseBody = error ?? `Cannot ${config.method} ${path}`;
    record(
      "finish",
      undefined,
      error
        ? "Unhandled error reaches the default error handler (500)."
        : "No handler responded; Express final handler returns 404.",
      root,
    );
  }
  return frames;
}
export function generateCode(input: Config): string {
  const config = validateConfig(input);
  const lines = [
    "import express from 'express';",
    "const app = express();",
    "// Express 5. Generated from the configured simulation.",
    "// next() does not return from the function. Explicit returns below prevent fall-through.",
  ];
  let routerCount = 0;
  function fn(layer: Layer): string {
    const args =
      layer.kind === "error" ? "err, req, res, next" : "req, res, next";
    const body: string[] = [];
    if (layer.property) {
      let value: unknown;
      try {
        value = JSON.parse(layer.value);
      } catch {
        value = layer.value;
      }
      body.push(
        `req[${JSON.stringify(layer.property)}] = ${JSON.stringify(value)};`,
      );
    }
    const message = JSON.stringify(layer.message);
    switch (layer.action) {
      case "next":
        body.push("return next();");
        break;
      case "error":
        body.push(`return next(new Error(${message}));`);
        break;
      case "reject":
        body.push(`throw new Error(${message});`);
        break;
      case "respond":
        body.push(`return res.status(${layer.status}).send(${message});`);
        break;
      case "route":
        body.push("return next('route');");
        break;
      case "router":
        body.push("return next('router');");
        break;
      case "pending":
        body.push(
          "// Deliberately no next() or response. Request remains pending.",
        );
        break;
    }
    return `${layer.action === "reject" ? "async " : ""}(${args}) => {\n    ${body.join("\n    ")}\n  }`;
  }
  function register(layers: Layer[], owner: string) {
    for (const layer of layers) {
      if (!layer.enabled) {
        lines.push(`// Disabled layer: ${JSON.stringify(layer.name)}`);
        continue;
      }
      if (layer.kind === "router") {
        const name = "router" + ++routerCount;
        lines.push(`const ${name} = express.Router();`);
        register(layer.children, name);
        lines.push(`${owner}.use(${JSON.stringify(layer.path)}, ${name});`);
      } else if (layer.kind === "route") {
        const callbacks = layer.children
          .filter((child) => child.enabled)
          .map(fn);
        lines.push(
          `${owner}.${layer.method === "ALL" ? "all" : layer.method.toLowerCase()}(${JSON.stringify(layer.path)}, ${callbacks.length ? callbacks.join(", ") : "(req, res, next) => next()"});`,
        );
      } else
        lines.push(
          `${owner}.use(${JSON.stringify(layer.path)}, ${fn(layer)});`,
        );
    }
  }
  register(config.layers, "app");
  lines.push(
    "app.listen(3000, () => console.log('Listening on http://localhost:3000'));",
    "",
  );
  return lines.join("\n\n");
}
export const flatten = (layers: Layer[]): Layer[] =>
  layers.flatMap((layer) => [layer, ...flatten(layer.children)]);
export function exampleConfig(preset = "logging"): Config {
  const logger = createLayer("middleware", "Request logger");
  logger.property = "requestId";
  logger.value = '"req-001"';
  const handler = createLayer("middleware", "Send response");
  handler.action = "respond";
  handler.message = "Hello from Express";
  const route = createLayer("route", "GET /users");
  route.path = "/users";
  route.children = [handler];
  const errorHandler = createLayer("error", "Error handler");
  errorHandler.message = "Something went wrong";
  if (preset === "error") {
    const auth = createLayer("middleware", "Authentication");
    auth.action = "reject";
    auth.message = "Authentication failed";
    return {
      version: 1,
      method: "GET",
      url: "/users",
      layers: [logger, auth, route, errorHandler],
    };
  }
  if (preset === "nested") {
    const router = createLayer("router", "API router");
    router.path = "/api";
    const nested = createLayer("router", "V1 router");
    nested.path = "/v1";
    nested.children = [route];
    router.children = [logger, nested];
    return {
      version: 1,
      method: "GET",
      url: "/api/v1/users?active=true",
      layers: [router, errorHandler],
    };
  }
  if (preset === "skip") {
    const gate = createLayer("middleware", "Skip this route");
    gate.action = "route";
    route.children = [gate, handler];
    const fallback = createLayer("route", "Fallback /users");
    fallback.path = "/users";
    const response = createLayer("middleware", "Fallback response");
    response.action = "respond";
    response.message = "Fallback route";
    fallback.children = [response];
    return {
      version: 1,
      method: "GET",
      url: "/users",
      layers: [logger, route, fallback, errorHandler],
    };
  }
  return {
    version: 1,
    method: "GET",
    url: "/users",
    layers: [logger, route, errorHandler],
  };
}
