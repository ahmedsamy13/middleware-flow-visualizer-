# SMSM Middleware Flow

A single-page, browser-only Express 5 middleware simulator built with React, TypeScript, Tailwind CSS and React Flow. This is a simulation of explicitly configured handlers, not tracing of an existing application or execution of pasted JavaScript.

## Run

Requires Node.js 22.18+.

```sh
npm install
npm run dev -- --port 5176
npm test
npm run build
```

## Features

- Assemble, name, enable/disable, reorder and remove middleware, routes, routers and error handlers.
- Add nested routers and route handler groups. Edit handler behavior, response status, error message and simple custom request properties.
- Step, play, pause and reset; inspect active/visited/skipped/failed nodes, execution reasons, router-local paths, baseUrl, params, custom properties and final response.
- **Request path only** (default) hides skipped layers from both the diagram and execution log. Step/Play advance directly to the next actual request event; the step counter uses only visible events and playback stops at the response or final outcome. **Full stack** shows all registered layers and restores skip explanations. Enable **Reveal as you step** to build the request diagram progressively; reset clears that view. The stack editor retains every registration. A final log summary shows Completed, Failed, Not found or Pending as appropriate. View changes never alter simulation results, JSON exports or generated code.
- Simulates next(), response termination, next(error), rejected promises, next('route'), next('router') and pending requests.
- Logging, authentication failure, nested router and route-skipping examples.
- Generate and copy corresponding Express 5 code. Export/import validated version 1 JSON configurations.
- All processing runs locally; no configuration storage or upload.

## Matching and semantics

Targets Express 5 defaults: case-insensitive paths, optional trailing slash, HEAD fallback to GET, prefix-matched mounts at segment boundaries and full-path route matching. Supports literal path segments and named `:parameters`; regex, wildcard, optional-segment and other advanced routing syntax are rejected. Router parameters use default `mergeParams:false`. Query strings do not affect path matching. Mounted handler snapshots use local req.path and baseUrl.

Incoming errors skip normal middleware and route registrations. Rejected promises forward errors as in Express 5. An error handler calling next() clears the error. next('route') is valid only within a route's handler group. next('router') is valid inside a router and exits that router. Unhandled errors return 500; exhausted normal stacks return 404. A configured pending handler leaves the request open.

The simulator performs **one action per handler**. It does not model asynchronous task scheduling, callbacks firing later, streaming, headersSent, or code after next(). next() transfers control but does not return from the current JavaScript function. Generated handlers explicitly return after next() to prevent unintended fall-through. Generated code requires Express 5 installed in the server project.

Custom request property values accept JSON or a string fallback. Built-in request fields and prototype-sensitive names cannot be overwritten. Limits: 80 layers, 8 nested levels, 200 KB imported file, 1,000-character URLs and bounded handler text/value fields. Every edit resets execution. Configuration version and layer IDs are validated before import.

## Verification

`npm test` compares representative simulated traces, local paths, params and status outcomes with actual requests to a temporary loopback Express 5 server. Scenarios cover order, route/method misses, nested routers, response termination, next('route'), next('router'), promise rejection, error recovery, unhandled errors and pending requests. Express and its types are development dependencies for these tests; the browser runtime has no backend.

Diagram tests also check request-only filtering, progressive reveal/reset, method/URL changes, error and pending paths, route skipping and unmatched-request empty states. Browser checks cover both view modes on desktop/mobile and ensure filtering does not remove layers from configuration exports or generated code.

`node tests/browser.mjs` checks playback, examples, handler editing, reorder/delete, configuration export, generated code, clipboard and responsive overflow. It uses an isolated headless Edge installation by default; set BROWSER_EXECUTABLE to another Chromium-compatible executable when needed. Start the dev server first.

## Research

- [Express: using middleware](https://expressjs.com/en/guide/using-middleware/)
- [Express: error handling](https://expressjs.com/en/guide/error-handling/)
- [Express 5 migration](https://expressjs.com/en/guide/migrating-5/)
- [React Flow custom nodes](https://reactflow.dev/learn/customization/custom-nodes)

Build output is in `dist/` and works on any static host. No database, server credentials or environment variables are required.
