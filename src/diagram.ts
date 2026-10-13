import { flatten, type Frame, type Layer } from "./engine.ts";

export type DiagramMode = "full" | "request";

// Keep original trace indices so switching views preserves playback position.
export function executionEvents(trace: Frame[], mode: DiagramMode) {
  return trace
    .map((frame, index) => ({ frame, index }))
    .filter(({ frame }) => mode === "full" || frame.event !== "skip");
}

// A skipped registration is not part of the executed request path. Router and
// route entries are retained to show the context of the handlers that ran.
export function requestFrames(trace: Frame[]): Frame[] {
  return trace.filter(
    (frame) => frame.id && (frame.event === "enter" || frame.event === "run"),
  );
}

export function diagramLayers(
  layers: Layer[],
  trace: Frame[],
  history: Frame[],
  mode: DiagramMode,
  revealAsYouStep: boolean,
): Layer[] {
  const all = flatten(layers);
  if (mode === "full") return all;
  const byId = new Map(all.map((layer) => [layer.id, layer]));
  const ids = new Set(
    requestFrames(revealAsYouStep ? history : trace).map((frame) => frame.id!),
  );
  return [...ids].flatMap((id) => {
    const layer = byId.get(id);
    return layer ? [layer] : [];
  });
}
