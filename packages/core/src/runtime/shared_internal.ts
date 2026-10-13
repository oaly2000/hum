import type { Component, Options as PreactOptions, VNode } from "preact";

/**
 * Marker prefix used for all Hum markers. Server and client both build and
 * parse markers through this module so the wire format cannot drift.
 */
export const MARKER_PREFIX = "hum:";

export const ISLAND_CLOSE = "/hum:island";
export const SLOT_CLOSE = "/hum:slot";
export const PARTIAL_CLOSE = "/hum:partial";
export const KEY_CLOSE = "/hum:key";
export const SIGNAL_CLOSE = "/hum:signal";

export const CLIENT_NAV_ATTR = "data-hum-client-nav";
export const DATA_HUM_KEY = "data-hum-key";

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

/**
 * Preact `options` hook names. `preact` exposes these as plain string keys on
 * the global `options` object (they are the Preact 10 names, still used by
 * `preact` 11 and by `preact-render-to-string`).
 */
export const OptionsType = {
  ATTR: "attr",
  VNODE: "vnode",
  DIFF: "__b",
  RENDER: "__r",
  DIFFED: "diffed",
  ERROR: "__e",
  COMMIT: "__c",
  ROOT: "__",
} as const;

export type OptionsKey = (typeof OptionsType)[keyof typeof OptionsType];

/**
 * Hum manipulates rendered trees generically (wrapping vnodes, injecting
 * markers), which requires props to be unconstrained.
 */
export type AnyVNode = VNode<any>;

export interface InternalVNode extends VNode {
  __c?: Component | null;
  __?: InternalVNode | null;
  __k?: InternalVNode[] | null;
}

export type InternalPreactOptions = PreactOptions & {
  [key: string]: unknown;
};

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

export function keyMarker(key: string): string {
  return `${MARKER_PREFIX}key:${key}`;
}

/**
 * Marker bracketing a page level signal rendered as a child
 * (`<p>{count}</p>`). The index addresses the payload entry holding the
 * signal.
 */
export function signalMarker(index: number): string {
  return `${MARKER_PREFIX}signal:${index}`;
}

export interface ParsedMarker {
  kind:
    | "island"
    | "slot"
    | "partial"
    | "key"
    | "signal"
    | "close-island"
    | "close-slot"
    | "close-partial"
    | "close-key"
    | "close-signal";
  parts: string[];
}

/** Parses a comment node's text into a marker description, if it is one. */
export function parseMarker(comment: string): ParsedMarker | null {
  if (comment === ISLAND_CLOSE) return { kind: "close-island", parts: [] };
  if (comment === SLOT_CLOSE) return { kind: "close-slot", parts: [] };
  if (comment === PARTIAL_CLOSE) return { kind: "close-partial", parts: [] };
  if (comment === KEY_CLOSE) return { kind: "close-key", parts: [] };
  if (comment === SIGNAL_CLOSE) return { kind: "close-signal", parts: [] };

  if (!comment.startsWith(MARKER_PREFIX)) return null;
  const parts = comment.split(":");
  const kind = parts[1];
  if (
    kind === "island" || kind === "slot" || kind === "partial" ||
    kind === "key" || kind === "signal"
  ) {
    return { kind, parts: parts.slice(2) };
  }
  return null;
}

export const UrlMatchKind = {
  None: 0,
  Ancestor: 1,
  Current: 2,
} as const;
export type UrlMatchKind = (typeof UrlMatchKind)[keyof typeof UrlMatchKind];

/**
 * Compares the currently rendered pathname with a link's `href`, used to mark
 * the active/ancestor navigation links.
 */
export function matchesUrl(
  current: string,
  needle: string,
  currentSearch?: string,
): UrlMatchKind {
  const needleUrl = new URL(needle, "http://localhost");
  let href = needleUrl.pathname;
  const needleSearch = needleUrl.search;

  if (href !== "/" && href.endsWith("/")) href = href.slice(0, -1);
  if (current !== "/" && current.endsWith("/")) current = current.slice(0, -1);

  if (current === href) {
    if (
      needleSearch && currentSearch !== undefined && needleSearch !== currentSearch
    ) {
      return UrlMatchKind.Ancestor;
    }
    return UrlMatchKind.Current;
  } else if (current.startsWith(href + "/") || href === "/") {
    return UrlMatchKind.Ancestor;
  }

  return UrlMatchKind.None;
}

/** Marks the active / ancestor link in a server rendered or hydrated tree. */
export function setActiveUrl(
  vnode: VNode,
  pathname: string,
  search?: string,
): void {
  const props = vnode.props as Record<string, unknown>;
  const hrefProp = props.href;
  if (typeof hrefProp !== "string" || !hrefProp.startsWith("/")) return;
  if (props["aria-current"] !== undefined) return;

  const match = matchesUrl(pathname, hrefProp, search);
  if (match === UrlMatchKind.Current) {
    props["data-current"] = "true";
    props["aria-current"] = "page";
  } else if (match === UrlMatchKind.Ancestor) {
    props["data-ancestor"] = "true";
    props["aria-current"] = "true";
  }
}

const ESCAPE_HTML: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPE_HTML[c]);
}

/**
 * Escapes a value so it can be embedded safely in an inline `<script>`. The
 * characters that could terminate the script element or open an HTML comment
 * are escaped, and `</` is broken up.
 */
export function escapeScript(value: string): string {
  return value
    .replaceAll("</", "<\\/")
    .replaceAll("<!--", "<\\!--")
    .replaceAll("-->", "--\\>")
    .replaceAll("<script", "<\\script")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

let BUILD_ID = "dev";

/** Internal: keeps `asset()` in sync with the running build. */
export function setBuildId(id: string): void {
  BUILD_ID = id;
}

/**
 * Returns a cache-busted URL for a static asset. Only same-origin, absolute
 * paths are rewritten; everything else is returned untouched.
 */
export function asset(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const url = new URL(path, "https://hum-asset.local");
  if (url.searchParams.has("__hum_build")) return path;
  url.searchParams.set("__hum_build", BUILD_ID);
  return url.pathname + url.search + url.hash;
}
