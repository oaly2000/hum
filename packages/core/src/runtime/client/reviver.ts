import {
  Component,
  Fragment,
  h,
  render,
  type ComponentChildren,
  type ComponentType,
  type VNode,
} from "preact";
import { computed, signal } from "@preact/signals";

import { type CustomParser, parse } from "../../jsonify/parse.js";
import { hum_factories } from "../events.js";
import {
  type AnyVNode,
  DATA_HUM_KEY,
  FACET_HANDLER_ATTR,
  FACET_SIGNAL_ATTR,
  parseMarker,
  PartialMode,
} from "../shared_internal.js";

const RootKind = {
  Island: 0,
  Partial: 1,
} as const;

/** Which kind of marker a VNode stack entry was created from. */
export const Marker = {
  Island: 0,
  Partial: 1,
  Slot: 2,
  Signal: 3,
} as const;
export type Marker = (typeof Marker)[keyof typeof Marker];

/**
 * Which kind of page level facet a DOM node carries. A facet is owned by the
 * Preact tree instead of by a marker scanner: a signal rendered as a child
 * becomes a `SignalText` component leaf, and a bound prop or handler stays a
 * prop on the element's vnode.
 */
const FacetKind = {
  Signal: 0,
  Element: 1,
} as const;
type FacetKind = (typeof FacetKind)[keyof typeof FacetKind];

interface SignalFacetReq {
  kind: typeof FacetKind.Signal;
  /** Payload index of the signal. */
  idx: number;
  start: Comment | Text;
  end: Comment | Text | null;
}

interface ElementFacetReq {
  kind: typeof FacetKind.Element;
  el: Element;
}

type FacetReq = SignalFacetReq | ElementFacetReq;

interface IslandReq {
  kind: typeof RootKind.Island;
  name: string;
  propsIdx: number;
  start: Comment | Text;
  end: Comment | Text | null;
}

interface PartialReq {
  kind: typeof RootKind.Partial;
  name: string;
  start: Comment | Text;
  end: Comment | Text | null;
}

interface ReviveContext {
  roots: Array<IslandReq | PartialReq>;
  stack: Array<PartialReq | IslandReq>;
  slots: Map<number, { name: string; start: Comment; end: Comment | null }>;
  slotIdStack: number[];
  /** Page level facets found outside any island / partial range. */
  facets: FacetReq[];
  /** Open `hum:signal` marker ranges, used to pair them up. */
  signalStack: SignalFacetReq[];
}

/**
 * Builds the root range entry for an island or partial marker. Both kinds
 * share the same opening structure — a hidden marker comment that had to
 * survive as the range start — so the parts are read in one place.
 */
function openRoot(
  node: Comment,
  kind: "island" | "partial",
  parts: string[],
): IslandReq | PartialReq {
  const hidden = maybeHideMarker(node);
  if (kind === "island") {
    return {
      kind: RootKind.Island,
      name: parts[0],
      propsIdx: Number(parts[1]),
      start: hidden as Comment,
      end: null,
    };
  }
  return {
    kind: RootKind.Partial,
    name: parts[0],
    start: hidden as Comment,
    end: null,
  };
}

interface SlotRef {
  kind: typeof SLOT_SYMBOL;
  name: string;
  id: number;
}

const SLOT_SYMBOL = Symbol.for("_HUM_SLOT");

function isSlotRef(x: unknown): x is SlotRef {
  return (
    x !== null && typeof x === "object" && "kind" in x &&
    (x as SlotRef).kind === SLOT_SYMBOL
  );
}

/**
 * One entry of the payload the server serialized. Island props, page level
 * signals and page level handlers share the array, which is what lets a value
 * used in several places (a signal bound as a child and as a prop) revive as a
 * single instance.
 */
export type PayloadEntry =
  | { props: Record<string, unknown>; slots?: SlotRef[] }
  | { signal: unknown }
  | { handler: unknown };

export type Payload = PayloadEntry[];

/** Returns the signal held by a payload entry, if it is a signal entry. */
function entrySignal(entry: PayloadEntry | undefined): unknown {
  return entry !== undefined && "signal" in entry ? entry.signal : undefined;
}

/** Partials that are currently mounted, keyed by partial name. */
export const ACTIVE_PARTIALS = new Map<string, PartialComp>();

/**
 * Keeps a partial region mounted so that a client side navigation can swap its
 * children without re-rendering the whole page.
 */
export class PartialComp extends Component<{
  children?: ComponentChildren;
  mode: PartialMode;
  name: string;
}> {
  override componentDidMount(): void {
    ACTIVE_PARTIALS.set(this.props.name, this);
  }

  override componentWillUnmount(): void {
    if (ACTIVE_PARTIALS.get(this.props.name) === this) {
      ACTIVE_PARTIALS.delete(this.props.name);
    }
  }

  override render(): ComponentChildren {
    return this.props.children;
  }
}
PartialComp.displayName = "Partial";

interface HumMarkerText extends Text {
  _humMarker: string;
}

const SHOW_MARKERS = false;

function isHumMarkerText(node: Node): node is HumMarkerText {
  return (
    node.nodeType === Node.TEXT_NODE &&
    typeof (node as HumMarkerText)._humMarker === "string"
  );
}

/**
 * Replaces a marker comment with an empty text node so marker comments do not
 * show up in the developer tools, while still keeping a DOM anchor for the
 * marker.
 */
export function maybeHideMarker(marker: Comment | Text): Comment | Text {
  if (SHOW_MARKERS) return marker;
  if (marker.nodeType !== Node.COMMENT_NODE) return marker;
  const text = document.createTextNode("") as HumMarkerText;
  text._humMarker = (marker as Comment).data;
  marker.parentNode?.insertBefore(text, marker);
  marker.remove();
  return text;
}

/** Registered island components, keyed by island name. */
export const ISLAND_REGISTRY = new Map<string, ComponentType>();

/**
 * Placeholders standing in for an island whose module never loaded. The tree
 * renderer keeps their markup as plain children and has nowhere to hand a slot
 * to, so slots are rendered in place instead of becoming props.
 */
const ISLAND_PASSTHROUGH = new WeakSet<VNode>();

export const CUSTOM_PARSER: CustomParser = {
  Signal: (value: unknown) => signal(value),
  Computed: (value: unknown) => computed(() => value),
  Slot: (value: { name: string; id: number }): SlotRef => ({
    kind: SLOT_SYMBOL,
    name: value.name,
    id: value.id,
  }),
  // A page level handler travels as the factory name plus the arguments it was
  // called with; calling the factory again rebuilds the closure here.
  Fn: (value: unknown) => {
    const [factory, args] = value as [string, unknown[]];
    const fn = hum_factories[factory];
    if (fn === undefined) {
      throw new Error(
        `Hum: the handler factory "${factory}" is not registered on the ` +
          `client. Import the module that defines it from the client entry or ` +
          `from an island, so it is evaluated before the page hydrates.`,
      );
    }
    return fn(...args);
  },
};

function createReviveCtx(): ReviveContext {
  return {
    roots: [],
    stack: [],
    slots: new Map(),
    slotIdStack: [],
    facets: [],
    signalStack: [],
  };
}

/**
 * Component leaf owning a page level signal that was rendered as a child.
 * Returning the signal itself hands the text node over to `@preact/signals`,
 * which patches it in place: no component above it re-renders.
 */
export function SignalText(props: { signal: unknown }): ComponentChildren {
  return props.signal as ComponentChildren;
}

/**
 * Moves the facet attributes of an adopted element into its props: a bound
 * signal stays a signal (so `@preact/signals` keeps the DOM property in sync)
 * and a bound handler stays a function (so Preact attaches the listener).
 */
function applyFacetAttrs(
  el: Element,
  props: Record<string, unknown>,
  payload: Payload,
): void {
  const bindings = parseFacetAttr(el.getAttribute(FACET_SIGNAL_ATTR));
  if (bindings !== null) {
    delete props[FACET_SIGNAL_ATTR];
    for (const name in bindings) {
      const value = entrySignal(payload[bindings[name]]);
      if (value !== undefined) props[name] = value;
    }
  }

  const events = parseFacetAttr(el.getAttribute(FACET_HANDLER_ATTR));
  if (events !== null) {
    delete props[FACET_HANDLER_ATTR];
    for (const name in events) {
      const entry = payload[events[name]];
      if (entry !== undefined && "handler" in entry) {
        props[name] = entry.handler;
      }
    }
  }
}

/**
 * Parses a `data-hum-signal` / `data-hum-handler` attribute, tolerating
 * anything that is not one.
 */
function parseFacetAttr(raw: string | null): Record<string, number> | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object"
      ? (parsed as Record<string, number>)
      : null;
  } catch {
    return null;
  }
}

function markerData(node: Comment | HumMarkerText): string {
  return isHumMarkerText(node) ? node._humMarker : node.data;
}

function walkInner(ctx: ReviveContext, node: Node): void {
  if (isElementNode(node)) {
    // Scripts and styles never contain markers, and once inside a slot the
    // content is collected when the slot is revived.
    if (
      node.nodeName === "SCRIPT" || node.nodeName === "STYLE" ||
      ctx.slotIdStack.length > 0
    ) {
      return;
    }
    // Facets inside an island or a partial are owned by that root's own tree.
    if (
      ctx.stack.length === 0 && ctx.signalStack.length === 0 &&
      (node.hasAttribute(FACET_SIGNAL_ATTR) ||
        node.hasAttribute(FACET_HANDLER_ATTR))
    ) {
      ctx.facets.push({ kind: FacetKind.Element, el: node });
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      walkInner(ctx, node.childNodes[i]);
    }
    return;
  }

  if (isCommentNode(node)) {
    const comment = node.data;
    const marker = parseMarker(comment);
    if (marker === null) return;

    if (marker.kind === "island" || marker.kind === "partial") {
      // Both roots share the same bracketing: hide the opening marker, record
      // the surviving node as the range start, and nest it under any open root.
      const found = openRoot(node, marker.kind, marker.parts);
      if (ctx.stack.length === 0) ctx.roots.push(found);
      ctx.stack.push(found);
      return;
    }

    if (marker.kind === "slot") {
      const hidden = maybeHideMarker(node);
      const id = Number(marker.parts[0]);
      ctx.slotIdStack.push(id);
      ctx.slots.set(id, {
        name: marker.parts[1],
        start: hidden as Comment,
        end: null,
      });
      return;
    }

    if (marker.kind === "signal") {
      const hidden = maybeHideMarker(node);
      const facet: SignalFacetReq = {
        kind: FacetKind.Signal,
        idx: Number(marker.parts[0]),
        start: hidden,
        end: null,
      };
      ctx.signalStack.push(facet);
      // Only a signal outside every root needs a root of its own; the others
      // are turned into vnodes while their region is adopted.
      if (ctx.stack.length === 0 && ctx.signalStack.length === 1) {
        ctx.facets.push(facet);
      }
      return;
    }

    if (marker.kind === "close-island" || marker.kind === "close-partial") {
      const hidden = maybeHideMarker(node);
      const item = ctx.stack.pop();
      if (item !== undefined) item.end = hidden as Comment;
      return;
    }

    if (marker.kind === "close-signal") {
      const hidden = maybeHideMarker(node);
      const facet = ctx.signalStack.pop();
      if (facet !== undefined) facet.end = hidden;
      return;
    }

    if (marker.kind === "close-slot") {
      const hidden = maybeHideMarker(node);
      const id = ctx.slotIdStack.pop();
      if (id !== undefined) {
        const entry = ctx.slots.get(id);
        if (entry !== undefined) entry.end = hidden as Comment;
      }
    }
  }
}

export function isCommentNode(node: Node): node is Comment {
  return node.nodeType === Node.COMMENT_NODE;
}

function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}

export function isElementNode(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE && !("_humRootFrag" in node);
}

/**
 * Creates a synthetic parent element spanning the DOM between two markers.
 * Islands are root level renders, so Preact must not append to the real parent
 * (that would move them to the end of the parent).
 */
export function createRootFragment(
  parent: Node,
  startMarker: Text | Comment,
  endMarker: Text | Comment,
): HTMLElement {
  const rootFrag: any = {
    _humRootFrag: true,
    nodeType: 1,
    parentNode: parent,
    nextSibling: null,
    get firstChild() {
      const child = startMarker.nextSibling;
      return child === endMarker ? null : child;
    },
    get childNodes() {
      const children: ChildNode[] = [];
      let child = startMarker.nextSibling;
      while (child !== null && child !== endMarker) {
        children.push(child);
        child = child.nextSibling;
      }
      return children;
    },
    insertBefore(node: Node, child: Node | null) {
      parent.insertBefore(node, child ?? endMarker);
    },
    appendChild(child: Node) {
      parent.insertBefore(child, endMarker);
    },
    removeChild(child: Node) {
      parent.removeChild(child);
    },
    contains(node: Node | null): boolean {
      if (node === null) return false;
      const children = rootFrag.childNodes as ChildNode[];
      for (let i = 0; i < children.length; i++) {
        if (children[i].contains(node)) return true;
      }
      return false;
    },
  };
  return rootFrag as HTMLElement;
}

function ServerSlot(props: { children?: ComponentChildren }): ComponentChildren {
  return props.children;
}

function addVNodeChild(
  parent: AnyVNode,
  child: AnyVNode | string,
): void {
  const props = parent.props;
  if (props.children === undefined || props.children === null) {
    props.children = [];
  }
  (props.children as unknown[]).push(child);
}

export function copyOldChildren(
  props: Record<string, unknown>,
  oldChildren: ComponentChildren,
): void {
  props.children = oldChildren === undefined || oldChildren === null
    ? []
    : Array.isArray(oldChildren)
    ? oldChildren
    : [oldChildren];
}

/**
 * Rebuilds a VNode tree from the DOM between `node` and `end`. Used for slots,
 * partial regions and page level facets: the markup rendered by the server is
 * turned back into VNodes so Preact can take over the region. Bound signals and
 * handlers come back from the payload, so the adopted tree is already reactive.
 */
export function domToVNode(
  payload: Payload,
  vnodeStack: AnyVNode[],
  markerStack: Marker[],
  node: Text | Comment | Node | DocumentFragment,
  end: Text | Comment | null,
): void {
  let sib: Node | null = node;
  while (sib !== null) {
    if (sib === end) return;

    if ((sib as any)._humRootFrag === true || sib instanceof DocumentFragment) {
      const first = sib.firstChild;
      if (first !== null) {
        domToVNode(payload, vnodeStack, markerStack, first, end);
      }
    } else if (isElementNode(sib)) {
      const props: Record<string, unknown> = {};
      const el = sib;
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        if (attr.name === DATA_HUM_KEY) {
          props.key = attr.value;
          continue;
        }
        // Boolean attributes are `true` whenever they are present.
        props[attr.name] =
          typeof (el as any)[attr.name] === "boolean" ? true : attr.value;
      }
      applyFacetAttrs(el, props, payload);

      const vnode = h(el.localName, props);
      const marker = markerStack.at(-1);
      const append = marker === Marker.Slot || marker === Marker.Partial;
      if (append) {
        addVNodeChild(vnodeStack.at(-1)!, vnode);
        vnodeStack.push(vnode);
      }

      if (el.firstChild !== null) {
        domToVNode(payload, vnodeStack, markerStack, el.firstChild, end);
      }

      if (append) vnodeStack.pop();
    } else if (isCommentNode(sib) || isHumMarkerText(sib)) {
      const comment = markerData(sib as Comment);
      const marker = parseMarker(comment);

      if (marker !== null) {
        if (marker.kind === "island") {
          const hidden = maybeHideMarker(sib as Comment);
          markerStack.push(Marker.Island);

          const name = marker.parts[0];
          const key = marker.parts[2] === "" ? undefined : marker.parts[2];
          const island = ISLAND_REGISTRY.get(name);

          let vnode: AnyVNode;
          if (island === undefined) {
            // An island whose module never loaded must not take the rest of the
            // tree down with it: `boot` skips such a root as well, and the
            // enclosing region still has to hydrate. Its markup is kept as
            // plain children, with the slots it would have received.
            console.error(`Hum: unknown island "${name}".`);
            vnode = h(Fragment, { key }) as AnyVNode;
            ISLAND_PASSTHROUGH.add(vnode);
          } else {
            const entry = payload[Number(marker.parts[1])];
            const props = entry !== undefined && "props" in entry
              ? entry.props
              : {};
            props.key = key;
            vnode = h(island as never, props) as AnyVNode;
          }

          addVNodeChild(vnodeStack.at(-1)!, vnode);
          vnodeStack.push(vnode);
          sib = hidden;
        } else if (marker.kind === "signal") {
          const hidden = maybeHideMarker(sib as Comment);
          markerStack.push(Marker.Signal);

          const vnode = h(SignalText, {
            signal: entrySignal(payload[Number(marker.parts[0])]),
          } as never);
          addVNodeChild(vnodeStack.at(-1)!, vnode as AnyVNode);
          vnodeStack.push(vnode as AnyVNode);
          sib = hidden;
        } else if (marker.kind === "slot") {
          const hidden = maybeHideMarker(sib as Comment);
          markerStack.push(Marker.Slot);

          const id = Number(marker.parts[0]);
          const name = marker.parts[1];
          const vnode = h(ServerSlot, {
            id,
            name,
            children: [],
          } as never);

          const parent = vnodeStack.at(-1)!;
          if (ISLAND_PASSTHROUGH.has(parent)) {
            // Nothing is there to receive the slot, so keep its content where
            // it was rendered instead.
            addVNodeChild(parent, vnode as AnyVNode);
          } else {
            (parent.props as Record<string, unknown>)[name] = vnode;
          }
          vnodeStack.push(vnode as VNode<Record<string, unknown>>);
          sib = hidden;
        } else if (marker.kind === "partial") {
          const hidden = maybeHideMarker(sib as Comment);
          markerStack.push(Marker.Partial);

          const name = marker.parts[0];
          const mode = Number(marker.parts[1]) as PartialMode;
          const key = marker.parts[2];

          let vnode: AnyVNode = h(PartialComp, {
            name,
            mode,
            key: key === "" ? undefined : key,
          } as never);

          const parent = vnodeStack.at(-1);
          if (parent !== undefined) addVNodeChild(parent, vnode);

          if (mode === PartialMode.Append || mode === PartialMode.Prepend) {
            const active = ACTIVE_PARTIALS.get(name);
            if (active !== undefined) {
              copyOldChildren(vnode.props, active.props.children);
              const wrapper: AnyVNode = h(Fragment, null);
              if (mode === PartialMode.Append) {
                addVNodeChild(vnode, wrapper);
              } else {
                if (!Array.isArray(vnode.props.children)) {
                  vnode.props.children = [];
                }
                (vnode.props.children as unknown[]).unshift(wrapper);
              }
              vnode = wrapper;
            }
          }

          vnodeStack.push(vnode);
          sib = hidden;
        } else if (
          marker.kind === "close-island" || marker.kind === "close-slot" ||
          marker.kind === "close-partial" || marker.kind === "close-signal"
        ) {
          vnodeStack.pop();
          markerStack.pop();
          sib = maybeHideMarker(sib as Comment);
        }
      }
    } else if (isTextNode(sib)) {
      const marker = markerStack.at(-1);
      if (marker === Marker.Slot || marker === Marker.Partial) {
        addVNodeChild(vnodeStack.at(-1)!, sib.data);
      }
    }

    sib = sib.nextSibling;
  }
}

/** Renders an island into the DOM range it was server rendered into. */
export function revive(
  props: Record<string, unknown>,
  component: ComponentType,
  container: HTMLElement,
  slots: ReviveContext["slots"],
  payload: Payload,
): void {
  const doRender = () => {
    for (const propName in props) {
      const value = props[propName];
      if (!isSlotRef(value)) continue;

      const marker = slots.get(value.id);
      if (marker !== undefined && marker.end !== null) {
        const root: AnyVNode = h(Fragment, null);
        const slotContainer = createRootFragment(
          container,
          marker.start,
          marker.end,
        );
        domToVNode(
          payload,
          [root],
          [Marker.Slot],
          slotContainer,
          marker.end,
        );
        props[propName] = root;
        continue;
      }

      const template = document.querySelector(
        `#hum-${value.id}-${value.name}`,
      ) as HTMLTemplateElement | null;
      if (template !== null) {
        const root = h(Fragment, null) as VNode<Record<string, unknown>>;
        domToVNode(payload, [root], [Marker.Slot], template.content, null);
        props[propName] = root;
      }
    }

    render(h(component as never, props as never), container);
  };

  schedule(doRender);
}

/**
 * Runs hydration work once `boot` has returned, so that neither an island nor a
 * page level facet pays for a render on the critical path. Every render goes
 * through here, which also keeps the order they were scheduled in.
 */
function schedule(callback: () => void): void {
  const scheduler = (globalThis as {
    scheduler?: { postTask?: (cb: () => void) => void };
  }).scheduler;
  if (typeof scheduler?.postTask === "function") {
    scheduler.postTask(callback);
  } else {
    setTimeout(callback, 0);
  }
}

/**
 * Entry point of the client runtime. Scans the server rendered DOM for islands,
 * partials and page level facets, and hydrates each of them with what was
 * serialized into the document.
 *
 * The scan is synchronous, but every render is scheduled through {@link
 * schedule}: nothing is live yet when `boot` returns, and the document is only
 * touched from the task after it.
 */
export function boot(
  initialIslands: Record<string, ComponentType>,
  payloadJson: string,
): void {
  const ctx = createReviveCtx();
  walkInner(ctx, document.body);

  for (const name in initialIslands) {
    ISLAND_REGISTRY.set(name, initialIslands[name]);
  }

  const payload = parse<Payload>(payloadJson, CUSTOM_PARSER);

  // Planned before the roots are revived: a host takes over the roots that fall
  // inside it, so they have to be removed before anything schedules a render.
  const facets = planFacets(ctx);

  for (let i = 0; i < ctx.roots.length; i++) {
    const root = ctx.roots[i];
    if (root.end === null) continue;

    if (root.start.parentNode !== root.end.parentNode) {
      console.error(
        `Hum hydration error: the ${
          root.kind === RootKind.Island ? "island" : "partial"
        } "${root.name}" has invalid HTML nesting: its start and end markers ` +
          `were reparented into different nodes by the browser.`,
      );
      continue;
    }

    const container = createRootFragment(
      root.start.parentNode as Node,
      root.start,
      root.end,
    );

    if (root.kind === RootKind.Island) {
      const entry = payload[root.propsIdx];
      if (entry === undefined || !("props" in entry)) continue;
      const component = ISLAND_REGISTRY.get(root.name);
      if (component === undefined) {
        console.error(`Hum: unknown island "${root.name}".`);
        continue;
      }
      revive(entry.props, component, container, ctx.slots, payload);
    } else {
      const props: Record<string, unknown> = {
        name: root.name,
        mode: PartialMode.Replace,
        children: null,
      };
      const domRoot = h(Fragment, null) as VNode<Record<string, unknown>>;
      domToVNode(payload, [domRoot], [Marker.Partial], container, root.end);
      props.children = domRoot.props.children;
      revive(
        props,
        PartialComp as unknown as ComponentType,
        container,
        ctx.slots,
        payload,
      );
    }
  }

  // Scheduled after the roots are, so a host renders before the facets that sit
  // outside it and the order matches the code above.
  schedule(() => {
    for (const facet of facets) {
      if (facet.kind === FacetKind.Signal) {
        hydrateSignalFacet(facet, payload);
      } else {
        hydrateElementFacet(facet, payload);
      }
    }
  });
}

/**
 * Facets that sit outside every island and partial need a Preact root of their
 * own, because nothing else owns their DOM. This orders and filters the facets
 * found by `walkInner`, and hands back the roots a host takes over:
 *
 * - an element facet covered by an already accepted host is dropped, the host's
 *   adopted tree turns it into a component leaf while it walks that subtree;
 * - a host renders its whole subtree, islands and partials included, so a root
 *   starting inside a host is removed from `ctx.roots`: one range must never be
 *   rendered by two roots, which would fight over the same DOM;
 * - a signal facet inside a host is dropped for the same reason.
 *
 * Removing the roots also removes the diagnostics `boot` runs for them, so an
 * unbalanced root of a host is reported here instead.
 */
function planFacets(ctx: ReviveContext): FacetReq[] {
  const hosts: ElementFacetReq[] = [];

  for (const facet of ctx.facets) {
    if (facet.kind !== FacetKind.Element) continue;
    if (hosts.some((host) => host.el.contains(facet.el))) continue;
    hosts.push(facet);
  }

  if (hosts.length > 0) {
    ctx.roots = ctx.roots.filter((root) => {
      if (!hosts.some((host) => host.el.contains(root.start))) return true;

      if (root.end !== null && root.start.parentNode !== root.end.parentNode) {
        console.error(
          `Hum hydration error: the ${
            root.kind === RootKind.Island ? "island" : "partial"
          } "${root.name}" has invalid HTML nesting: its start and end markers ` +
            `were reparented into different nodes by the browser.`,
        );
      }
      return false;
    });
  }

  const out: FacetReq[] = [...hosts];
  for (const facet of ctx.facets) {
    if (facet.kind !== FacetKind.Signal) continue;
    if (hosts.some((host) => host.el.contains(facet.start))) continue;
    out.push(facet);
  }
  return out;
}

/**
 * Hands the text node of a page level signal to a `SignalText` component leaf.
 * The signal patches the text node directly, so nothing above it re-renders.
 */
function hydrateSignalFacet(facet: SignalFacetReq, payload: Payload): void {
  if (facet.end === null) return;
  const parent = facet.start.parentNode;
  if (parent === null || facet.end.parentNode !== parent) return;

  const container = createRootFragment(parent, facet.start, facet.end);
  render(
    h(SignalText, { signal: entrySignal(payload[facet.idx]) } as never),
    container,
  );
}

/**
 * Adopts a page level element as a component leaf: its markup becomes a VNode
 * tree (with bound signals and handlers restored from the payload) which Preact
 * renders back over the range. Because the tree was derived from that very
 * markup, Preact reuses the existing DOM nodes instead of recreating them.
 */
function hydrateElementFacet(facet: ElementFacetReq, payload: Payload): void {
  const el = facet.el;
  const parent = el.parentNode;
  if (parent === null) return;

  // A root fragment needs an anchor on either side; the element is the range.
  const start = document.createTextNode("");
  const end = document.createTextNode("");
  parent.insertBefore(start, el);
  parent.insertBefore(end, el.nextSibling);

  const container = createRootFragment(parent, start, end);
  const root: AnyVNode = h(Fragment, null);
  domToVNode(payload, [root], [Marker.Slot], el, end);
  render(h(Fragment, null, root.props.children as never), container);
}
