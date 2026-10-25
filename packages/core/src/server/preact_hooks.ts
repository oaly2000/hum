import { AsyncLocalStorage } from "node:async_hooks";
import {
  Fragment,
  h,
  isValidElement,
  options as preactOptions,
  type VNode,
} from "preact";
import type { ComponentChildren } from "preact";
import type { ReadonlySignal, Signal } from "@preact/signals";

import type { BuildCache } from "./build_cache.js";
import { stringify, type Stringifiers } from "../jsonify/stringify.js";
import { islandTagOf } from "../shared/island_tag.js";
import type { Island } from "../types.js";
import { factoryMarkerOf } from "../protocol/factory.js";
import { isPartialType, type PartialProps } from "../shared/partial.js";
import { type AnyVNode, OptionsType } from "../shared/preact.js";
import {
  CLIENT_NAV_ATTR,
  DATA_HUM_KEY,
  FACET_HANDLER_ATTR,
  FACET_SIGNAL_ATTR,
  islandMarker,
  normalizeKey,
  PARTIAL_SEARCH_PARAM,
  partialMarker,
  PartialMode,
  signalMarker,
  slotMarker,
} from "../protocol/markers.js";
import { setActiveUrl } from "../shared/url.js";
import type { PayloadEntry } from "../protocol/payload.js";

/** Comment emitted where the merged route `head` tags are injected. */
export const HEAD_PLACEHOLDER_PREFIX = "hum:head-placeholder:";

/** Comment emitted where the client boot script is injected. */
export const SCRIPTS_PLACEHOLDER_PREFIX = "hum:scripts-placeholder:";

interface RenderStateOptions {
  url: URL;
  buildCache: BuildCache;
  basePath: string;
}

interface SlotEntry {
  id: number;
  name: string;
  vnode: VNode;
}

/**
 * Per request rendering state. The Preact `options` hooks installed by this
 * module read from async-local storage, which keeps concurrent renders isolated
 * and preserves the state across asynchronous rendering work.
 */
export class RenderState {
  nonce: string;
  partialDepth = 0;
  slots: Array<SlotEntry | null> = [];
  payload: PayloadEntry[] = [];
  /** Number of page level facets that were recorded in `payload`. */
  facetCount = 0;
  islands = new Set<Island>();
  factories = new Set<string>();
  /** Islands whose renderer must already be available to an enclosing tree. */
  eagerIslands = new Set<Island>();
  islandAssets = new Set<string>();
  /** Head tags merged from the `head` exports of the render chain. */
  headNodes: ComponentChildren[] = [];
  owners = new Map<VNode, VNode | undefined>();
  ownerStack: VNode[] = [];
  facetOwnerStack: boolean[] = [];
  encounteredPartials = new Set<string>();
  renderedHtmlTag = false;
  renderedHtmlHead = false;
  renderedHtmlBody = false;
  clientNavEnabled = false;
  /**
   * When the response only needs to update partials, the collected head
   * elements and the bootstrap script are replaced by a state JSON script.
   */
  readonly partialRequest: boolean;

  readonly url: URL;
  readonly pathname: string;
  readonly search: string;
  readonly buildCache: BuildCache;
  readonly basePath: string;

  constructor(options: RenderStateOptions) {
    this.url = options.url;
    this.pathname = options.url.pathname;
    this.search = options.url.search;
    this.buildCache = options.buildCache;
    this.basePath = options.basePath;
    this.partialRequest = options.url.searchParams.has(PARTIAL_SEARCH_PARAM);
    this.nonce = globalThis.crypto.randomUUID().replaceAll("-", "");
  }

  clear(): void {
    this.islands.clear();
    this.factories.clear();
    this.islandAssets.clear();
    this.eagerIslands.clear();
    this.encounteredPartials.clear();
    this.owners.clear();
    this.headNodes = [];
    this.slots = [];
    this.payload = [];
    this.facetCount = 0;
    this.ownerStack = [];
    this.facetOwnerStack = [];
  }

  /** True when the page needs the client runtime at all. */
  get needsClientRuntime(): boolean {
    if (
      this.islands.size > 0 || this.clientNavEnabled || this.facetCount > 0
    ) {
      return true;
    }
    if (!this.partialRequest && this.encounteredPartials.size > 0) return true;
    return false;
  }
}

const RENDER_STATE_KEY = "__humRenderStateStorage__";
const globalRef = globalThis as typeof globalThis & {
  [RENDER_STATE_KEY]?: AsyncLocalStorage<RenderState>;
};
const renderStateStorage = globalRef[RENDER_STATE_KEY] ??
  (globalRef[RENDER_STATE_KEY] = new AsyncLocalStorage<RenderState>());

export function getRenderState(): RenderState | null {
  return renderStateStorage.getStore() ?? null;
}

export function withRenderState<T>(
  state: RenderState,
  fn: () => T,
): T {
  return renderStateStorage.run(state, fn);
}

/**
 * Wraps an options hook, chaining to the previously installed one so other
 * addons (and `preact-render-to-string` itself) keep working. When the
 * installed hook returns a value it wins; otherwise the previous hook's value
 * is used, which is what value returning hooks like `attr` need.
 */
function wrapHook(
  key: string,
  hook: (...args: unknown[]) => unknown,
): void {
  const options = preactOptions as unknown as Record<string, unknown>;
  const prev = options[key] as ((...args: unknown[]) => unknown) | undefined;
  options[key] = (...args: unknown[]) => {
    const result = hook(...args);
    if (result !== undefined) return result;
    return prev?.(...args);
  };
}

function wrapWithMarker(
  vnode: unknown,
  kind: string,
  marker: string,
): AnyVNode {
  return h(
    Fragment,
    null,
    h(Fragment, { UNSTABLE_comment: marker } as never),
    vnode as never,
    h(Fragment, { UNSTABLE_comment: `/hum:${kind}` } as never),
  );
}

/** Marker component: replaced by the collected `<head>` elements. */
function HeadPlaceholder(props: { id: string }): AnyVNode {
  return h(Fragment, {
    UNSTABLE_comment: HEAD_PLACEHOLDER_PREFIX + props.id,
  } as never);
}

/** Marker component: replaced by the client bootstrap script. */
function ScriptsPlaceholder(props: { id: string }): AnyVNode {
  return h(Fragment, {
    UNSTABLE_comment: SCRIPTS_PLACEHOLDER_PREFIX + props.id,
  } as never);
}

interface SlotProps {
  name: string;
  id: number;
  children?: unknown;
}

/**
 * Renders a JSX element that was passed as a prop to an island, wrapped in
 * `hum:slot` markers so the client can pick the DOM range up again.
 */
function Slot(props: SlotProps): AnyVNode {
  const state = getRenderState();
  if (state !== null) state.slots[props.id] = null;
  return wrapWithMarker(
    props.children,
    "slot",
    slotMarker(props.id, props.name),
  );
}

/**
 * The island a component is, if the build publishes one under that name.
 *
 * Identity is the component's own — the tag the bundler left on it — so a
 * component is recognized wherever it was loaded from.
 */
function islandOf(state: RenderState, component: unknown): Island | undefined {
  const tag = islandTagOf(component);
  return tag === undefined
    ? undefined
    : state.buildCache.islands.get(tag.name);
}

/** Checks whether the current component is (nested) inside an island. */
function hasIslandOwner(state: RenderState, vnode: VNode): boolean {
  let current: VNode | undefined = vnode;
  let owner: VNode | undefined;
  while (current !== undefined && (owner = state.owners.get(current)) !== undefined) {
    if (islandOf(state, owner.type) !== undefined) return true;
    current = owner;
  }
  return false;
}

function isSignal(x: any): x is Signal {
  return (
    x !== null &&
    typeof x === "object" &&
    typeof x.peek === "function" &&
    "value" in x
  );
}

function isComputedSignal(x: any): x is ReadonlySignal {
  return isSignal(x) &&
    (("x" in x && typeof x.x === "function") ||
      ("_fn" in x && typeof x._fn === "function"));
}

function isVNode(x: any): x is VNode {
  return x !== null && typeof x === "object" && "type" in x && "ref" in x &&
    "__k" in x && isValidElement(x);
}

/**
 * Signal props captured while their vnode was created. Addons that patch Preact
 * after Hum does (`@preact/signals`, `preact/compat`) install their hooks around
 * Hum's, so their `diff` hook can run first and replace a signal prop with its
 * current value before {@link bindFacetProps} ever sees the vnode. Remembering
 * the signal while the props are still untouched keeps the binding working
 * whatever the install order is.
 */
const VNODE_SIGNAL_PROPS = new WeakMap<VNode, Record<string, Signal>>();

function rememberSignalProps(
  vnode: VNode,
  props: Record<string, unknown>,
): void {
  let signals: Record<string, Signal> | undefined;
  for (const name in props) {
    const value = props[name];
    if (isSignal(value)) (signals ??= {})[name] = value;
  }
  if (signals !== undefined) VNODE_SIGNAL_PROPS.set(vnode, signals);
}

/**
 * True when the component that is currently rendering is (nested) inside an
 * island. Walks the owner chain from the vnode on top of the render stack, so
 * it can run while a vnode is being created.
 */
function isInsideIsland(state: RenderState): boolean {
  let current: VNode | undefined = state.ownerStack.at(-1);
  while (current !== undefined) {
    if (islandOf(state, current.type) !== undefined) return true;
    current = state.owners.get(current);
  }
  return false;
}

/**
 * Whether page level facets are part of the payload of this render. Inside a
 * partial response only the regions are updated, so everything outside them is
 * dropped: those nodes are already hydrated on the client.
 */
function recordsFacets(state: RenderState): boolean {
  return !state.partialRequest || state.partialDepth > 0;
}

/**
 * True for props whose name looks like a DOM event handler: `onClick`, but also
 * `oninput`, the shape `preact/compat` normalizes `onInput`—and the `onChange`
 * of a text input—into before Hum sees the vnode.
 *
 * Preact attaches every `on*` prop holding a function as a listener and only
 * lowercases the name when it starts with a capital, so accepting either case
 * here is what the client will do with the prop anyway.
 */
function isEventProp(name: string): boolean {
  if (name.length < 3 || name[0] !== "o" || name[1] !== "n") return false;
  const c = name.charCodeAt(2);
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

/**
 * Component that renders the current value of a page level signal and brackets
 * it with `hum:signal` markers, so the client can hand the text node over to a
 * `SignalText` component leaf.
 */
function SignalFacet(
  props: { signal: Signal<unknown>; insideIsland: boolean },
): ComponentChildren {
  const state = getRenderState();
  if (state === null || props.insideIsland || !recordsFacets(state)) {
    return props.signal.peek() as ComponentChildren;
  }
  const idx = recordFacet(state, { signal: props.signal });
  return wrapWithMarker(
    props.signal.peek(),
    "signal",
    signalMarker(idx),
  ) as ComponentChildren;
}

function recordFacet(state: RenderState, entry: PayloadEntry): number {
  state.facetCount++;
  return state.payload.push(entry) - 1;
}

/**
 * Replaces page level signal children with a `SignalFacet`. Signals inside an
 * island are left alone: the island's own client render binds them, so markers
 * there would be thrown away with the island's server rendered markup.
 */
function wrapFacetChildren(
  props: Record<string, unknown>,
  state: RenderState,
): void {
  const children = props.children;
  if (children === undefined || children === null) return;

  if (isSignal(children)) {
    if (isComputedSignal(children)) return;
    props.children = h(SignalFacet, {
      signal: children,
      insideIsland: isInsideIsland(state),
    });
    return;
  }

  if (!Array.isArray(children)) return;
  let replaced: unknown[] | undefined;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!isSignal(child) || isComputedSignal(child)) continue;
    replaced ??= children.slice();
    replaced[i] = h(SignalFacet, {
      signal: child,
      insideIsland: isInsideIsland(state),
    });
  }
  if (replaced !== undefined) props.children = replaced;
}

/**
 * Moves page level signal props and serializable handlers out of the vnode into
 * the payload, leaving the `data-hum-signal` / `data-hum-handler` attributes
 * behind for the client to
 * rebind them from.
 *
 * Signal props are peeked everywhere, including inside islands: a signal is not
 * a DOM attribute, and the island binds it again when it renders on the client.
 */
function bindFacetProps(
  vnode: VNode,
  props: Record<string, unknown>,
  state: RenderState,
  pageLevel: boolean,
): void {
  const record = pageLevel && recordsFacets(state);
  /** Signals this vnode carried when it was created. */
  const remembered = VNODE_SIGNAL_PROPS.get(vnode);
  let signals: Record<string, number> | undefined;
  let handlers: Record<string, number> | undefined;

  for (const name in props) {
    if (
      name === "children" || name === "key" || name === "ref" ||
      name === FACET_SIGNAL_ATTR || name === FACET_HANDLER_ATTR
    ) {
      continue;
    }

    const value = props[name];
    const signalProp = isSignal(value) ? value : remembered?.[name];
    if (signalProp !== undefined) {
      // Read through a structural type: the computed check below narrows
      // `signalProp` to `never`, because every `Signal` also matches
      // `ReadonlySignal`.
      const peekable = signalProp as { peek(): unknown };
      if (isComputedSignal(signalProp)) continue;
      props[name] = peekable.peek();
      if (record) {
        (signals ??= {})[name] = recordFacet(state, { signal: signalProp });
      }
      continue;
    }

    if (typeof value !== "function") continue;

    if (factoryMarkerOf(value) !== undefined) {
      if (record) {
        (handlers ??= {})[name] = recordFacet(state, { handler: value });
      }
      delete props[name];
    } else if (pageLevel && isEventProp(name)) {
      // Addons normalize event names before Hum runs, so a name that does not
      // match what the source wrote is expected rather than a mistake.
      const normalized = name === name.toLowerCase()
        ? " The name is lowercased because an addon such as `preact/compat` " +
          "normalizes event names."
        : "";
      throw new Error(
        `Hum: the page level handler for \`${name}\` cannot be serialized. ` +
          "Build it with `defineFactory` or a built-in event factory " +
          "(setFromProp, setValue, add, toggle) from `@humjs/core/client`, " +
          "or move it into an island." + normalized,
      );
    }
  }

  if (signals !== undefined) props[FACET_SIGNAL_ATTR] = JSON.stringify(signals);
  if (handlers !== undefined) props[FACET_HANDLER_ATTR] = JSON.stringify(handlers);
}

/**
 * Enables serialization of signals, JSX element props and factory produced
 * handlers. Signals are revived as reactive signals on the client, element
 * props become slot references, and a handler travels as the factory name plus
 * the arguments it was called with so the client can rebuild it.
 */
const HUM_STRINGIFIERS: Stringifiers = {
  Computed: (value: unknown) =>
    isComputedSignal(value) ? { value: value.peek() } : undefined,
  Signal: (value: unknown) => (isSignal(value) ? { value: value.peek() } : undefined),
  Fn: (value: unknown) => {
    const marker = factoryMarkerOf(value);
    return marker === undefined
      ? undefined
      : { value: [marker.factory, marker.args] };
  },
  Slot: (value: unknown) => {
    if (isVNode(value) && value.type === Slot) {
      const props = value.props as SlotProps;
      return { value: { name: props.name, id: props.id } };
    }
    return undefined;
  },
};

const PATCHED = new WeakSet<VNode>();

const HOOKS_FLAG = "__hum_preact_hooks_installed__";

/**
 * Installs the Preact options hooks that implement islands, slots and
 * partials. Head tags come from route `head` exports and are therefore never
 * intercepted here.
 *
 * The flag that keeps this idempotent lives on Preact's options object, which
 * is one object per Preact: re-evaluating the module in place (a bundler's HMR)
 * marks the same one and installs nothing twice. A flag on `globalThis` would
 * instead be shared by every copy of the framework in the same process — or in
 * the same Worker isolate — so the first copy to install would silence all the
 * others. Those copies render with no hooks at all: no island markers, no
 * slots, and a page whose `<html>` the renderer never sees, which it answers by
 * wrapping the finished document in a second one.
 */
function installHooks(): void {
  const options = preactOptions as unknown as Record<string, unknown>;
  if (options[HOOKS_FLAG] === true) return;
  options[HOOKS_FLAG] = true;

  wrapHook(OptionsType.VNODE, (...args) => {
    const vnode = args[0] as VNode;
    const state = getRenderState();

    if (state !== null) {
      state.owners.set(vnode, state.ownerStack.at(-1));
      if (vnode.type === "a") {
        setActiveUrl(vnode, state.pathname, state.search);
      }
      if (vnode.type === "script" || vnode.type === "style") {
        const props = vnode.props as Record<string, unknown>;
        if (props.nonce === undefined) props.nonce = state.nonce;
      }
      if (vnode.type === "head") {
        appendChild(vnode, h(HeadPlaceholder, { id: state.nonce }));
      }
      if (vnode.type === "body") {
        appendChild(vnode, h(ScriptsPlaceholder, { id: state.nonce }));
      }
      const props = vnode.props as Record<string, unknown>;
      if (CLIENT_NAV_ATTR in props) {
        props[CLIENT_NAV_ATTR] = String(props[CLIENT_NAV_ATTR]);
      }
      if (typeof vnode.type === "string") {
        rememberSignalProps(vnode, props);
        wrapFacetChildren(props, state);
      }
    }

    if (isPartialType(vnode.type)) {
      const props = vnode.props as PartialProps;
      const mode = !props.mode || props.mode === "replace"
        ? PartialMode.Replace
        : props.mode === "append"
        ? PartialMode.Append
        : PartialMode.Prepend;
      props.children = wrapWithMarker(
        props.children,
        "partial",
        partialMarker(props.name, mode, normalizeKey(vnode.key)),
      );
    }
  });

  wrapHook(OptionsType.ATTR, (...args) => {
    const [name, value] = args as [string, unknown];
    if (name === CLIENT_NAV_ATTR) {
      return `${CLIENT_NAV_ATTR}="${String(Boolean(value))}"`;
    }
    if (name === "key") {
      return `${DATA_HUM_KEY}="${escapeAttr(String(value))}"`;
    }
    return undefined;
  });

  wrapHook(OptionsType.DIFF, (...args) => {
    const vnode = args[0] as VNode;
    const state = getRenderState();
    if (state === null) return;

    if (typeof vnode.type === "function" && vnode.type !== Fragment) {
      if (isPartialType(vnode.type)) {
        state.partialDepth++;
        const props = vnode.props as PartialProps;
        if (typeof props.name === "string") {
          if (state.encounteredPartials.has(props.name)) {
            throw new Error(
              `Hum: the rendered response contains the partial "${props.name}" ` +
                `more than once. Partial names must be unique per page.`,
            );
          }
          state.encounteredPartials.add(props.name);
        }
        return;
      }

      if (PATCHED.has(vnode)) return;

      const island = islandOf(state, vnode.type);
      if (island === undefined) return;

      if (hasIslandOwner(state, vnode)) {
        for (const css of island.css) state.islandAssets.add(css);
        return;
      }

      state.islands.add(island);
      if (state.partialDepth > 0 || state.facetOwnerStack.at(-1) === true) {
        state.eagerIslands.add(island);
      }

      const originalType = vnode.type;
      // Replacing `type` lets us inspect the props that Preact passes to the
      // component and to wrap the rendered output with island markers.
      vnode.type = ((props: Record<string, unknown>) => {
        for (const name in props) {
          const value = props[name];
          if (name === "children" || (isValidElement(value) && !isSignal(value))) {
            const slotId = state.slots.length;
            state.slots.push({
              id: slotId,
              name,
              vnode: value as VNode,
            });
            props[name] = h(Slot, { name, id: slotId }, value as never);
          }
        }

        const propsIdx = state.payload.push({ props }) - 1;
        const child = h(originalType as never, props);
        PATCHED.add(child);
        return wrapWithMarker(
          child,
          "island",
          islandMarker(island.name, propsIdx, normalizeKey(vnode.key)),
        );
      }) as never;
      return;
    }

    if (typeof vnode.type === "string") {
      switch (vnode.type) {
        case "html":
          state.renderedHtmlTag = true;
          break;
        case "head":
          state.renderedHtmlHead = true;
          break;
        case "body":
          state.renderedHtmlBody = true;
          break;
      }

      const props = vnode.props as Record<string, unknown>;
      if (
        CLIENT_NAV_ATTR in props &&
        props[CLIENT_NAV_ATTR] === "true"
      ) {
        state.clientNavEnabled = true;
      }
      const insideIsland = hasIslandOwner(state, vnode);
      if (
        vnode.key !== undefined &&
        (state.partialDepth > 0 || insideIsland)
      ) {
        props[DATA_HUM_KEY] = String(vnode.key);
      }
      bindFacetProps(vnode, props, state, !insideIsland);
      state.facetOwnerStack.push(
        state.facetOwnerStack.at(-1) === true ||
          FACET_SIGNAL_ATTR in props || FACET_HANDLER_ATTR in props,
      );
    }
  });

  wrapHook(OptionsType.RENDER, (...args) => {
    const vnode = args[0] as VNode;
    const state = getRenderState();
    if (
      state !== null && typeof vnode.type === "function" &&
      vnode.type !== Fragment
    ) {
      state.ownerStack.push(vnode);
    }
  });

  wrapHook(OptionsType.DIFFED, (...args) => {
    const vnode = args[0] as VNode;
    const state = getRenderState();
    if (
      state !== null && typeof vnode.type === "function" &&
      vnode.type !== Fragment
    ) {
      state.ownerStack.pop();
      if (isPartialType(vnode.type)) state.partialDepth--;
    }
    if (state !== null && typeof vnode.type === "string") {
      state.facetOwnerStack.pop();
    }
  });
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function appendChild(vnode: AnyVNode, child: AnyVNode): void {
  const props = vnode.props as { children?: unknown };
  if (props.children === undefined || props.children === null) {
    props.children = child;
  } else if (Array.isArray(props.children)) {
    (props.children as unknown[]).push(child);
  } else {
    props.children = [props.children, child];
  }
}

/**
 * Serializes the island props, page level signals and page level handlers
 * collected during the render into the compact payload the client runtime
 * revives. The result is plain JSON text; callers embed it as a JS string
 * literal so the client can parse it again.
 */
export function serializePayload(state: RenderState): string {
  state.factories.clear();
  return stringify(state.payload, {
    ...HUM_STRINGIFIERS,
    Fn(value: unknown) {
      const marker = factoryMarkerOf(value);
      if (marker === undefined) return undefined;
      state.factories.add(marker.factory);
      return { value: [marker.factory, marker.args] };
    },
  });
}

// The hooks have to be active before the first `renderToString` call, so they
// are installed as a module side effect.
installHooks();
