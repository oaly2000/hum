/**
 * Marker prefix used for all Hum markers. Server and client both build and
 * parse markers through this module so the wire format cannot drift.
 */
const MARKER_PREFIX = "hum:";

const ISLAND_CLOSE = "/hum:island";
const SLOT_CLOSE = "/hum:slot";
const SIGNAL_CLOSE = "/hum:signal";

/**
 * Closing marker of a partial region. It is part of the client/server wire
 * protocol, so the client parses partials through `parseMarker()` and compares
 * against this constant instead of re-spelling the literal.
 */
export const PARTIAL_CLOSE = "/hum:partial";

export const CLIENT_NAV_ATTR = "data-hum-client-nav";
export const DATA_HUM_KEY = "data-hum-key";

/**
 * Query parameter that marks a request as a partial navigation. The client
 * sets it and the server branches on it; both read the same constant so the
 * two halves of the protocol cannot drift.
 */
export const PARTIAL_SEARCH_PARAM = "_hum_partial";

/** Id of the JSON script carrying island info for a partial response. */
export const PARTIAL_STATE_ID = "__HUM_STATE__";

/**
 * Attribute a page level element carries when one of its props is bound to a
 * signal. Its value is a JSON map of `propName → payload index`.
 */
export const FACET_SIGNAL_ATTR = "data-hum-signal";
/**
 * Attribute a page level element carries when one of its props is a
 * serializable event handler. Its value is a JSON map of `propName → payload
 * index`.
 */
export const FACET_HANDLER_ATTR = "data-hum-handler";

/** How a partial replacement should be applied on the client. */
export const PartialMode = {
  Replace: 0,
  Append: 1,
  Prepend: 2,
} as const;
export type PartialMode = (typeof PartialMode)[keyof typeof PartialMode];


/**
 * Keys end up inside comment markers, which are split on `:`. Replace the
 * separator so a user supplied key can never break marker parsing.
 */
export function normalizeKey(key: unknown): string {
  if (key === undefined || key === null) return "";
  const s = typeof key === "string" ? key : String(key);
  return s.replaceAll(":", "_");
}

export function islandMarker(
  name: string,
  propsIdx: number,
  key: string,
): string {
  return `${MARKER_PREFIX}island:${name}:${propsIdx}:${key}`;
}

export function slotMarker(id: number, name: string): string {
  return `${MARKER_PREFIX}slot:${id}:${name}`;
}

export function partialMarker(
  name: string,
  mode: PartialMode,
  key: string,
): string {
  return `${MARKER_PREFIX}partial:${name}:${mode}:${key}`;
}

/**
 * Marker bracketing a page level signal rendered as a child
 * (`<p>{count}</p>`). The index addresses the payload entry holding the
 * signal.
 */
export function signalMarker(index: number): string {
  return `${MARKER_PREFIX}signal:${index}`;
}

interface ParsedMarker {
  kind:
    | "island"
    | "slot"
    | "partial"
    | "signal"
    | "close-island"
    | "close-slot"
    | "close-partial"
    | "close-signal";
  parts: string[];
}

/** Parses a comment node's text into a marker description, if it is one. */
export function parseMarker(comment: string): ParsedMarker | null {
  if (comment === ISLAND_CLOSE) return { kind: "close-island", parts: [] };
  if (comment === SLOT_CLOSE) return { kind: "close-slot", parts: [] };
  if (comment === PARTIAL_CLOSE) return { kind: "close-partial", parts: [] };
  if (comment === SIGNAL_CLOSE) return { kind: "close-signal", parts: [] };

  if (!comment.startsWith(MARKER_PREFIX)) return null;
  const parts = comment.split(":");
  const kind = parts[1];
  if (
    kind === "island" || kind === "slot" || kind === "partial" ||
    kind === "signal"
  ) {
    return { kind, parts: parts.slice(2) };
  }
  return null;
}
