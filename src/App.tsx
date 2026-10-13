import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Node,
  type NodeProps,
  type Edge,
} from "@xyflow/react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  Code2,
  Copy,
  GitBranch,
  Github,
  Info,
  Layers,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  createLayer,
  exampleConfig,
  flatten,
  generateCode,
  simulate,
  validateConfig,
  type Config,
  type Layer,
  type Frame,
} from "./engine";
import "@xyflow/react/dist/style.css";
import { diagramLayers, requestFrames, type DiagramMode } from "./diagram";

type FlowNode = Node<{ layer: Layer; state: string; active: boolean }, "layer">;
const labels: Record<Layer["action"], string> = {
  next: "next()",
  respond: "Send response",
  error: "next(error)",
  route: "next('route')",
  router: "next('router')",
  reject: "Rejected promise",
  pending: "No next / response",
};
function FlowLayer({ data }: NodeProps<FlowNode>) {
  return (
    <div
      className={`flow-node state-${data.state} ${data.active ? "node-active" : ""}`}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <div className="flow-node-top">
        <span className={`kind-dot kind-${data.layer.kind}`} />
        <span>
          {data.layer.kind === "route"
            ? data.layer.method
            : data.layer.kind.toUpperCase()}
        </span>
        <small>{data.layer.enabled ? "" : "DISABLED"}</small>
      </div>
      <strong>{data.layer.name}</strong>
      <div className="flow-node-bottom">
        <code>
          {data.layer.kind === "route" || data.layer.kind === "router"
            ? data.layer.path
            : labels[data.layer.action]}
        </code>
        <span>
          {data.active
            ? "ACTIVE"
            : data.state === "idle"
              ? ""
              : data.state.toUpperCase()}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
}
const nodeTypes = { layer: FlowLayer };
function mapLayers(layers: Layer[], fn: (layer: Layer) => Layer): Layer[] {
  return layers.map((layer) =>
    fn({ ...layer, children: mapLayers(layer.children, fn) }),
  );
}
function findContext(
  layers: Layer[],
  id: string,
  parent: Layer | null = null,
  inRoute = false,
  inRouter = false,
): { parent: Layer | null; inRoute: boolean; inRouter: boolean } | null {
  for (const layer of layers) {
    if (layer.id === id) return { parent, inRoute, inRouter };
    const found = findContext(
      layer.children,
      id,
      layer,
      inRoute || layer.kind === "route",
      inRouter || layer.kind === "router",
    );
    if (found) return found;
  }
  return null;
}
const repo = "https://github.com/ahmedsamy13/middleware-flow-visualizer-";
export default function App() {
  const [config, setConfig] = useState<Config>(() => exampleConfig());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cursor, setCursor] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(700);
  const [status, setStatus] = useState("");
  const [preset, setPreset] = useState("logging");
  const [codeOpen, setCodeOpen] = useState(false);
  const [diagramMode, setDiagramMode] = useState<DiagramMode>("request");
  const [revealAsYouStep, setRevealAsYouStep] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const result = useMemo(() => {
    try {
      return { trace: simulate(config), code: generateCode(config), error: "" };
    } catch (error) {
      return {
        trace: [] as Frame[],
        code: "",
        error:
          error instanceof Error ? error.message : "Invalid configuration.",
      };
    }
  }, [config]);
  useEffect(() => {
    setCursor(-1);
    setPlaying(false);
  }, [config]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setCursor((current) => Math.min(current + 1, result.trace.length - 1)),
      speed,
    );
    return () => clearInterval(timer);
  }, [playing, result.trace.length, speed]);
  useEffect(() => {
    if (cursor >= result.trace.length - 1 && cursor >= 0) setPlaying(false);
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "instant",
    });
  }, [cursor, result.trace.length]);
  const all = flatten(config.layers);
  const selected = all.find((layer) => layer.id === selectedId);
  const context = selected ? findContext(config.layers, selected.id) : null;
  const current = cursor >= 0 ? result.trace[cursor] : undefined;
  const finished = cursor === result.trace.length - 1 && cursor >= 0;
  const history = result.trace.slice(0, cursor + 1);
  const latest = new Map(
    history.filter((frame) => frame.id).map((frame) => [frame.id, frame]),
  );
  const visibleLayers = diagramLayers(
    config.layers,
    result.trace,
    history,
    diagramMode,
    revealAsYouStep,
  );
  const visibleIds = new Set(visibleLayers.map((layer) => layer.id));
  const depths = new Map<string, number>();
  function depthsFor(layers: Layer[], depth = 0) {
    layers.forEach((layer) => {
      depths.set(layer.id, depth);
      depthsFor(layer.children, depth + 1);
    });
  }
  depthsFor(config.layers);
  const nodes: FlowNode[] = visibleLayers.map((layer, index) => ({
    id: layer.id,
    type: "layer",
    position: { x: 40 + (depths.get(layer.id) ?? 0) * 55, y: 35 + index * 128 },
    deletable: false,
    selected: layer.id === selectedId,
    connectable: false,
    ariaLabel: `${layer.kind} ${layer.name}`,
    data: {
      layer,
      active: current?.id === layer.id,
      state: !layer.enabled
        ? "skipped"
        : latest.get(layer.id)?.event === "skip"
          ? "skipped"
          : current?.id === layer.id && current.outcome === "failed"
            ? "failed"
            : current?.id === layer.id && current.outcome === "pending"
              ? "pending"
              : latest.has(layer.id)
                ? "visited"
                : "idle",
    },
  }));
  const edges: Edge[] = visibleLayers
    .slice(1)
    .map((layer, index) => ({
      id: `order-${index}`,
      source: visibleLayers[index].id,
      target: layer.id,
      type: "smoothstep",
      style: { stroke: "#4c6478", strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#4c6478" },
      deletable: false,
    }));
  const runs = requestFrames(history).filter((frame) => visibleIds.has(frame.id!));
  for (let index = 1; index < runs.length; index++)
    if (runs[index - 1].id !== runs[index].id)
      edges.push({
        id: `trace-${index}`,
        source: runs[index - 1].id!,
        target: runs[index].id!,
        type: "smoothstep",
        style: { stroke: "#9acbff", strokeWidth: 2.4 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#9acbff" },
        deletable: false,
      });
  function update(id: string, patch: Partial<Layer>) {
    setConfig((current) => ({
      ...current,
      layers: mapLayers(current.layers, (layer) =>
        layer.id === id ? { ...layer, ...patch } : layer,
      ),
    }));
    setStatus("");
  }
  function add(kind: Layer["kind"], parentId?: string) {
    const layer = createLayer(
      kind,
      kind === "route"
        ? "New route"
        : kind === "router"
          ? "New router"
          : kind === "error"
            ? "Error handler"
            : "Middleware",
    );
    if (kind === "route")
      layer.children = [createLayer("middleware", "Route handler")];
    setConfig((current) => ({
      ...current,
      layers: parentId
        ? mapLayers(current.layers, (parent) =>
            parent.id === parentId
              ? { ...parent, children: [...parent.children, layer] }
              : parent,
          )
        : [...current.layers, layer],
    }));
    setSelectedId(layer.id);
  }
  function remove(id: string) {
    function filter(layers: Layer[]): Layer[] {
      return layers
        .filter((layer) => layer.id !== id)
        .map((layer) => ({ ...layer, children: filter(layer.children) }));
    }
    setConfig((current) => ({ ...current, layers: filter(current.layers) }));
    setSelectedId(null);
  }
  function reorder(id: string, delta: number) {
    function move(layers: Layer[]): Layer[] {
      const found = layers.findIndex((layer) => layer.id === id);
      if (found >= 0) {
        const target = found + delta;
        if (target < 0 || target >= layers.length) return layers;
        const clone = [...layers];
        [clone[found], clone[target]] = [clone[target], clone[found]];
        return clone;
      }
      return layers.map((layer) => ({
        ...layer,
        children: move(layer.children),
      }));
    }
    setConfig((current) => ({ ...current, layers: move(current.layers) }));
  }
  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > 200000) {
      setStatus("Use a configuration under 200 KB.");
      return;
    }
    try {
      setConfig(validateConfig(JSON.parse(await file.text())));
      setSelectedId(null);
      setStatus("Configuration imported.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Invalid JSON configuration.",
      );
    }
    if (importRef.current) importRef.current.value = "";
  }
  function exportConfig() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(config, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "middleware-flow.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("Configuration exported.");
  }
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(result.code);
      setStatus("Express code copied.");
    } catch {
      setStatus(
        "Clipboard unavailable. Select the generated code and copy manually.",
      );
    }
  }
  function tree(layers: Layer[], depth = 0): React.ReactNode {
    return layers.map((layer, index) => (
      <div key={layer.id}>
        <button
          className={`stack-row ${selectedId === layer.id ? "stack-selected" : ""} ${!layer.enabled ? "stack-disabled" : ""}`}
          style={{ paddingLeft: 14 + depth * 17 }}
          onClick={() => setSelectedId(layer.id)}
        >
          <span className="stack-index">{index + 1}</span>
          <span className={`kind-dot kind-${layer.kind}`} />
          <span>
            <strong>{layer.name}</strong>
            <small>
              {layer.kind === "route"
                ? `${layer.method} ${layer.path}`
                : layer.kind === "router"
                  ? `Router ${layer.path}`
                  : labels[layer.action]}
            </small>
          </span>
          <ChevronDown size={12} />
        </button>
        {tree(layer.children, depth + 1)}
      </div>
    ));
  }
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#">
          <span className="brand-icon">
            <GitBranch size={21} />
          </span>
          <span>
            <b>smsm</b> middleware flow<span className="text-accent">.</span>
          </span>
        </a>
        <div className="header-links">
          <span className="express-badge">EXPRESS 5</span>
          <a
            href={repo}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub repository"
          >
            <Github size={17} />
            <span>GitHub</span>
            <ArrowRight size={13} />
          </a>
        </div>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span />
              REQUEST / RESPONSE / NEXT
            </div>
            <h1>
              Follow the request.
              <br className="sm:hidden" /> <span>Understand the flow.</span>
            </h1>
            <p>
              An interactive Express 5 simulation. Build a stack, then watch
              each decision.
            </p>
          </div>
          <div className="intro-note">
            <Layers size={19} />
            <span>
              {all.length} layers
              <br />
              <small>One request. Every step.</small>
            </span>
          </div>
        </section>
        <div className="request-bar">
          <div className="request-input">
            <label htmlFor="request-method">REQUEST</label>
            <select
              id="request-method"
              value={config.method}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  method: event.target.value,
                }))
              }
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map(
                (method) => (
                  <option key={method}>{method}</option>
                ),
              )}
            </select>
            <input
              aria-label="Request URL"
              value={config.url}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  url: event.target.value,
                }))
              }
              placeholder="/api/users"
            />
          </div>
          <div className="preset-input">
            <label htmlFor="example">Example</label>
            <select
              id="example"
              value={preset}
              onChange={(event) => {
                setPreset(event.target.value);
                setConfig(exampleConfig(event.target.value));
                setSelectedId(null);
              }}
            >
              <option value="logging">Logging & route</option>
              <option value="error">Authentication failure</option>
              <option value="nested">Nested routers</option>
              <option value="skip">Skip to next route</option>
            </select>
          </div>
        </div>
        <div className="workspace">
          <aside className="editor-panel">
            <div className="panel-heading">
              <span>
                <Layers size={15} />
                Middleware stack
              </span>
              <span className="subtle">Registration order</span>
            </div>
            <div className="add-toolbar">
              <button onClick={() => add("middleware")}>
                <Plus size={12} />
                Middleware
              </button>
              <button onClick={() => add("route")}>
                <Plus size={12} />
                Route
              </button>
              <button onClick={() => add("router")}>
                <Plus size={12} />
                Router
              </button>
              <button onClick={() => add("error")}>
                <Plus size={12} />
                Error
              </button>
            </div>
            <div className="stack-tree">
              {tree(config.layers)}
              {!all.length && (
                <p className="empty-stack">Add a layer to start exploring.</p>
              )}
            </div>
            {selected ? (
              <section className="layer-editor" aria-label="Edit layer">
                <div className="edit-heading">
                  <h2>Edit layer</h2>
                  <div>
                    <button
                      aria-label="Move layer up"
                      onClick={() => reorder(selected.id, -1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      aria-label="Move layer down"
                      onClick={() => reorder(selected.id, 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      aria-label="Remove layer"
                      onClick={() => remove(selected.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      aria-label="Close layer editor"
                      onClick={() => setSelectedId(null)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <label>
                  Name
                  <input
                    value={selected.name}
                    onChange={(event) =>
                      update(selected.id, { name: event.target.value })
                    }
                    maxLength={80}
                  />
                </label>
                <div className="edit-fields">
                  <label>
                    Path
                    <input
                      value={selected.path}
                      onChange={(event) =>
                        update(selected.id, { path: event.target.value })
                      }
                      disabled={!!context?.inRoute}
                    />
                  </label>
                  {selected.kind === "route" && (
                    <label>
                      Method
                      <select
                        value={selected.method}
                        onChange={(event) =>
                          update(selected.id, { method: event.target.value })
                        }
                      >
                        {[
                          "GET",
                          "POST",
                          "PUT",
                          "PATCH",
                          "DELETE",
                          "HEAD",
                          "OPTIONS",
                          "ALL",
                        ].map((method) => (
                          <option key={method}>{method}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                {selected.kind === "router" || selected.kind === "route" ? (
                  <div className="child-actions">
                    <span className="small-label">
                      ADD INSIDE {selected.kind.toUpperCase()}
                    </span>
                    <div>
                      <button onClick={() => add("middleware", selected.id)}>
                        <Plus size={12} />
                        Handler
                      </button>
                      <button onClick={() => add("error", selected.id)}>
                        <Plus size={12} />
                        Error handler
                      </button>
                      {selected.kind === "router" && (
                        <>
                          <button onClick={() => add("route", selected.id)}>
                            <Plus size={12} />
                            Route
                          </button>
                          <button onClick={() => add("router", selected.id)}>
                            <Plus size={12} />
                            Router
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <label>
                      Handler behavior
                      <select
                        aria-label="Handler behavior"
                        value={selected.action}
                        onChange={(event) =>
                          update(selected.id, {
                            action: event.target.value as Layer["action"],
                          })
                        }
                      >
                        {Object.entries(labels)
                          .filter(
                            ([action]) =>
                              (action !== "route" || context?.inRoute) &&
                              (action !== "router" || context?.inRouter),
                          )
                          .map(([action, label]) => (
                            <option key={action} value={action}>
                              {label}
                            </option>
                          ))}
                      </select>
                    </label>
                    {["respond", "error", "reject"].includes(
                      selected.action,
                    ) && (
                      <label>
                        {selected.action === "respond"
                          ? "Response / message"
                          : "Error message"}
                        <input
                          value={selected.message}
                          onChange={(event) =>
                            update(selected.id, { message: event.target.value })
                          }
                        />
                      </label>
                    )}
                    {selected.action === "respond" && (
                      <label>
                        Response status
                        <input
                          type="number"
                          min={200}
                          max={599}
                          value={selected.status}
                          onChange={(event) =>
                            update(selected.id, {
                              status: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    )}
                    <div className="edit-fields">
                      <label>
                        Set req property
                        <input
                          placeholder="user"
                          value={selected.property}
                          onChange={(event) =>
                            update(selected.id, {
                              property: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Value (JSON or text)
                        <input
                          placeholder={'{"id":1}'}
                          value={selected.value}
                          onChange={(event) =>
                            update(selected.id, { value: event.target.value })
                          }
                        />
                      </label>
                    </div>
                  </>
                )}
                <label className="enabled-option">
                  <input
                    type="checkbox"
                    checked={selected.enabled}
                    onChange={(event) =>
                      update(selected.id, { enabled: event.target.checked })
                    }
                  />
                  Layer enabled
                </label>
              </section>
            ) : (
              <div className="edit-placeholder">
                <Info size={16} />
                <p>
                  Click any layer to edit its behavior or add nested handlers.
                </p>
              </div>
            )}
            <div className="config-actions">
              <input
                ref={importRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(event) => void importFile(event.target.files?.[0])}
              />
              <button onClick={() => importRef.current?.click()}>
                <Upload size={13} />
                Import JSON
              </button>
              <button disabled={!!result.error} onClick={exportConfig}>
                <ArrowDownToLine size={13} />
                Export JSON
              </button>
            </div>
          </aside>
          <section className="visual-panel">
            <div className="playback-bar">
              <div>
                <button
                  onClick={() => {
                    if (finished) setCursor(-1);
                    setPlaying(!playing);
                  }}
                  disabled={!!result.error || !result.trace.length}
                  className="primary-button"
                >
                  {playing ? <Pause size={14} /> : <Play size={14} />}{" "}
                  {playing ? "Pause" : "Play"}
                </button>
                <button
                  onClick={() => {
                    setPlaying(false);
                    setCursor((current) =>
                      Math.min(current + 1, result.trace.length - 1),
                    );
                  }}
                  disabled={!!result.error || finished}
                  className="secondary-button"
                >
                  <SkipForward size={14} />
                  Step
                </button>
                <button
                  aria-label="Reset execution"
                  title="Reset execution"
                  onClick={() => {
                    setPlaying(false);
                    setCursor(-1);
                  }}
                >
                  <RotateCcw size={16} />
                </button>
              </div>
              <div>
                <select
                  aria-label="Playback speed"
                  value={speed}
                  onChange={(event) => setSpeed(Number(event.target.value))}
                >
                  <option value={1200}>Slow</option>
                  <option value={700}>Normal</option>
                  <option value={300}>Fast</option>
                </select>
                <span
                  className={`outcome outcome-${current?.outcome ?? "ready"}`}
                >
                  {current?.outcome ?? "Ready"}
                </span>
              </div>
            </div>
            <div className="diagram-toolbar">
              <div role="group" aria-label="Diagram view" className="diagram-view">
                <button
                  aria-pressed={diagramMode === "full"}
                  onClick={() => setDiagramMode("full")}
                >
                  Full stack
                </button>
                <button
                  aria-pressed={diagramMode === "request"}
                  onClick={() => setDiagramMode("request")}
                >
                  Request path only
                </button>
              </div>
              {diagramMode === "request" && (
                <label className="diagram-reveal">
                  <input
                    type="checkbox"
                    checked={revealAsYouStep}
                    onChange={(event) => setRevealAsYouStep(event.target.checked)}
                  />
                  Reveal as you step
                </label>
              )}
              <span className="diagram-count" aria-live="polite">
                {visibleLayers.length} / {all.length} layers shown
              </span>
            </div>
            <p className="diagram-help">
              {diagramMode === "full"
                ? "All registered layers. Skipped steps appear dimmed."
                : revealAsYouStep
                  ? "Only entered routes, routers and executed handlers appear as you step. Skips stay in the log."
                  : "Complete path for this configured request. Skipped layers are hidden; Step and Play highlight progress."}
            </p>
            <div className="flow-canvas" aria-label="Middleware diagram">
              <ReactFlow<FlowNode>
                key={`${diagramMode}-${revealAsYouStep}-${visibleLayers.map((layer) => layer.id).join(",")}`}
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodeClick={(_, node) => setSelectedId(node.id)}
                colorMode="dark"
                fitView
                minZoom={0.15}
                maxZoom={1.6}
                fitViewOptions={{ padding: 0.2 }}
                nodesConnectable={false}
                nodesDraggable={false}
                deleteKeyCode={null}
                edgesReconnectable={false}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={22}
                  color="#334b60"
                />
                <Controls showInteractive={false} />
              </ReactFlow>
              {!visibleLayers.length && (
                <div className="diagram-empty" role="status">
                  <GitBranch size={24} />
                  <strong>
                    {result.error
                      ? "Fix the configuration to see the request path."
                      : diagramMode === "request" && revealAsYouStep && cursor < 0
                        ? "Press Step or Play to reveal the request path."
                        : "No layers execute for this request."}
                  </strong>
                  <p>
                    {diagramMode === "request" && all.length > 0
                      ? "Switch to Full stack to inspect every registration."
                      : "Add a layer to start exploring."}
                  </p>
                </div>
              )}
              <div className="diagram-legend">
                <span>
                  <i className="legend-active" />
                  Active
                </span>
                <span>
                  <i className="legend-visited" />
                  Visited
                </span>
                {diagramMode === "full" && (
                  <span>
                    <i className="legend-skipped" />
                    Skipped
                  </span>
                )}
                <span>
                  <i className="legend-failed" />
                  Failed
                </span>
              </div>
            </div>
            <div className="log-heading">
              <span>
                <Code2 size={14} />
                Execution log
              </span>
              <span>
                {cursor + 1} / {result.trace.length} steps
              </span>
            </div>
            <div
              className="execution-log"
              ref={logRef}
              role="log"
              aria-label="Execution log"
            >
              {history.map((frame, index) => (
                <div className={`log-row log-${frame.event}`} key={index}>
                  <span className="log-index">{index + 1}</span>
                  <div>
                    <strong>
                      {frame.name}
                      <small>{frame.event}</small>
                    </strong>
                    <p>{frame.reason}</p>
                    <code>
                      {frame.baseUrl || "(app)"} · local path {frame.path}
                    </code>
                  </div>
                </div>
              ))}
              {!history.length && (
                <div className="log-empty">
                  <Play size={20} />
                  <p>Press Step or Play to follow the request.</p>
                </div>
              )}
            </div>
          </section>
        </div>
        {result.error && (
          <div className="error-message" role="alert">
            <Info size={16} />
            {result.error}
          </div>
        )}
        <div className="request-snapshot">
          <div>
            <span className="small-label">REQUEST SNAPSHOT</span>
            <code>
              {config.method} {config.url}
            </code>
            <p>
              baseUrl: {current?.baseUrl || '""'} · local path:{" "}
              {current?.path ||
                new URL(
                  config.url.startsWith("/") ? config.url : "/",
                  "http://local",
                ).pathname}
            </p>
          </div>
          <div>
            <span className="small-label">CUSTOM PROPERTIES & PARAMS</span>
            <pre>
              {JSON.stringify(
                {
                  properties: current?.properties ?? {},
                  params: current?.params ?? {},
                },
                null,
                2,
              )}
            </pre>
          </div>
          <div>
            <span className="small-label">RESPONSE / ERROR</span>
            <strong
              className={
                current?.outcome === "failed" ? "text-error" : "text-success"
              }
            >
              {current?.status ? `${current.status} · ` : ""}
              {current?.response || current?.error || "No response yet"}
            </strong>
            <p>
              {current?.outcome === "pending"
                ? "The request stays open until something responds."
                : finished
                  ? "Execution complete."
                  : "Waiting for the next step."}
            </p>
          </div>
        </div>
        <div className="status-line" role="status">
          {status}
        </div>
        <section className="code-section">
          <div className="code-heading">
            <button
              onClick={() => setCodeOpen(!codeOpen)}
              aria-expanded={codeOpen}
            >
              <Code2 size={16} />
              Generated Express 5 code
              <ChevronDown size={14} />
            </button>
            <button
              onClick={() => void copyCode()}
              disabled={!!result.error}
              className="secondary-button"
            >
              {status === "Express code copied." ? (
                <Check size={13} />
              ) : (
                <Copy size={13} />
              )}
              Copy code
            </button>
          </div>
          {codeOpen && (
            <pre aria-label="Generated Express code">
              <code>
                {result.code || "Fix the configuration to generate code."}
              </code>
            </pre>
          )}
        </section>
        <aside className="learning-note">
          <Info size={17} />
          <div>
            <strong>
              next() moves control. It does not stop your function.
            </strong>
            <p>
              This simulator models one configured action per handler. Real
              JavaScript can continue after next(); generated handlers
              explicitly return to avoid that fall-through. This is a local
              simulation, not live tracing or arbitrary JavaScript execution.
            </p>
          </div>
        </aside>
        <details className="limitations">
          <summary>
            Matching rules & simulation limits
            <ChevronDown size={13} />
          </summary>
          <p>
            Targets Express 5. Supports literal paths and :name parameters,
            case-insensitive matching, optional trailing slashes and HEAD-to-GET
            fallback. Middleware and router mounts match path prefixes at
            segment boundaries; route registrations match full local paths.
            Routers use default mergeParams:false. Query strings do not affect
            matching. Advanced path syntax, regex, asynchronous scheduling, code
            after next(), streaming and headersSent behavior are not modeled.
            Custom properties are simple JSON or strings. Every edit resets
            execution.
          </p>
          <a
            href="https://expressjs.com/en/guide/using-middleware/"
            target="_blank"
            rel="noreferrer"
          >
            Express middleware documentation
            <ArrowRight size={13} />
          </a>
        </details>
      </main>
      <footer>
        <span>
          <GitBranch size={14} />
          smsm middleware flow.
        </span>
        <span>One request. A clearer understanding.</span>
        <a href={repo} target="_blank" rel="noreferrer">
          Open source
          <ArrowRight size={13} />
        </a>
      </footer>
    </div>
  );
}
