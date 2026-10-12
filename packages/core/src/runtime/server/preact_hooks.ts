import {
  Fragment,
  h,
  isValidElement,
  options as preactOptions,
  type VNode,
} from "preact";
import type { ComponentChildren } from "preact";
import type { ReadonlySignal, Signal } from "@preact/signals";

import type { BuildCache } from "../../build_cache.js";
import { stringify, type Stringifiers } from "../../jsonify/stringify.js";
import type { Island } from "../../types.js";
import { isPartialType, type PartialProps } from "../shared.js";
import {
  type AnyVNode,
  CLIENT_NAV_ATTR,
  DATA_HUM_KEY,
  islandMarker,
  normalizeKey,
  OptionsType,
  partialMarker,
  PartialMode,
  setActiveUrl,
  slotMarker,
} from "../shared_internal.js";

/** Search param that switches a response into partial-update mode. */
export const PARTIAL_SEARCH_PARAM = "_hum_partial";

/** Comment emitted where the merged route `head` tags are injected. */
export const HEAD_PLACEHOLDER_PREFIX = "hum:head-placeholder:";

/** Comment emitted where the client boot script is injected. */
export const SCRIPTS_PLACEHOLDER_PREFIX = "hum:scripts-placeholder:";

export interface RenderStateOptions {
  url: URL;
  buildCache: BuildCache;
  basePath: string;
}

interface SlotEntry {
  id: number;
  name: string;
  vnode: VNode;
}

interface IslandPropsEntry {
  props: Record<string, unknown>;
}

/**
 * Per request rendering state. The Preact `options` hooks installed by this
 * module read from the module level {@link RENDER_STATE} pointer, which is why
 * it must be set before rendering and cleared afterwards — otherwise two
 * concurrent requests would write into the same island props array.
 */
export class RenderState {
  nonce: string;
  partialDepth = 0;
  slots: Array<SlotEntry | null> = [];
  islandProps: IslandPropsEntry[] = [];
  islands = new Set<Island>();
  islandAssets = new Set<string>();
  /** Head tags merged from the `head` exports of the render chain. */
  headNodes: ComponentChildren[] = [];
  owners = new Map<VNode, VNode | undefined>();
  ownerStack: VNode[] = [];
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
    this.islandAssets.clear();
    this.encounteredPartials.clear();
    this.owners.clear();
    this.headNodes = [];
    this.slots = [];
    this.islandProps = [];
    this.ownerStack = [];
  }

  /** True when the page needs the client runtime at all. */
  get needsClientRuntime(): boolean {
    if (this.islands.size > 0 || this.clientNavEnabled) return true;
    if (!this.partialRequest && this.encounteredPartials.size > 0) return true;
    return false;
  }
}

let RENDER_STATE: RenderState | null = null;

export function getRenderState(): RenderState | null {
  return RENDER_STATE;
}

export function setRenderState(state: RenderState | null): void {
  RENDER_STATE = state;
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
export function HeadPlaceholder(props: { id: string }): AnyVNode {
  return h(Fragment, {
    UNSTABLE_comment: HEAD_PLACEHOLDER_PREFIX + props.id,
  } as never);
}

/** Marker component: replaced by the client bootstrap script. */
export function ScriptsPlaceholder(props: { id: string }): AnyVNode {
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

/** Checks whether the current component is (nested) inside an island. */
function hasIslandOwner(state: RenderState, vnode: VNode): boolean {
  let current: VNode | undefined = vnode;
  let owner: VNode | undefined;
  while (current !== undefined && (owner = state.owners.get(current)) !== undefined) {
    if (state.buildCache.islandRegistry.has(owner.type)) return true;
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
 * Enables serialization of signals and JSX element props. Signals are revived
 * as reactive signals on the client, element props become slot references.
 */
export const HUM_STRINGIFIERS: Stringifiers = {
  Computed: (value: unknown) =>
    isComputedSignal(value) ? { value: value.peek() } : undefined,
  Signal: (value: unknown) => (isSignal(value) ? { value: value.peek() } : undefined),
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
 * intercepted here. Safe to call repeatedly; the flag is stored on
 * `globalThis` so
 * that a re-evaluated module (bundler HMR) cannot install the hooks twice.
 */
export function installHooks(): void {
  const global = globalThis as Record<string, unknown>;
  if (global[HOOKS_FLAG] === true) return;
  global[HOOKS_FLAG] = true;

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

      const island = state.buildCache.islandRegistry.get(vnode.type);
      if (island === undefined) return;

      if (hasIslandOwner(state, vnode)) {
        for (const css of island.css) state.islandAssets.add(css);
        return;
      }

      state.islands.add(island);

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

        const propsIdx = state.islandProps.push({ props }) - 1;
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
      if (
        vnode.key !== undefined &&
        (state.partialDepth > 0 || hasIslandOwner(state, vnode))
      ) {
        props[DATA_HUM_KEY] = String(vnode.key);
      }
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
 * Serializes the island props collected during the render into the compact
 * payload the client runtime revives. The result is plain JSON text; callers
 * embed it as a JS string literal so the client can parse it again.
 */
export function serializeIslandProps(state: RenderState): string {
  return stringify(state.islandProps, HUM_STRINGIFIERS);
}

// The hooks have to be active before the first `renderToString` call, so they
// are installed as a module side effect.
installHooks();
