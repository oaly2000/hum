import { Fragment, h, type ComponentChildren, type VNode } from "preact";
import { type AnyVNode } from "../shared/preact.js";
import {
  DATA_HUM_KEY,
  FACET_HANDLER_ATTR,
  FACET_SIGNAL_ATTR,
  parseMarker,
  PartialMode,
} from "../protocol/markers.js";
import type { Payload } from "../protocol/payload.js";
import { entrySignal } from "./payload.js";
import { ACTIVE_PARTIALS, PartialComp } from "./partial_component.js";
import { ISLAND_REGISTRY } from "./registry.js";

export const RootKind = {
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
export const FacetKind = {
  Signal: 0,
  Element: 1,
} as const;
type FacetKind = (typeof FacetKind)[keyof typeof FacetKind];

export interface SignalFacetReq {
  kind: typeof FacetKind.Signal;
  /** Payload index of the signal. */
  idx: number;
  start: Comment | Text;
  end: Comment | Text | null;
}

export interface ElementFacetReq {
  kind: typeof FacetKind.Element;
  el: Element;
  delegates: string[];
}

type FacetReq = SignalFacetReq | ElementFacetReq;

interface IslandReq {
  kind: typeof RootKind.Island;
  name: string;
  propsIdx: number;
  delegates: string[];
  delegateGroups: Record<string, string[]>;
  host?: ElementFacetReq;
  start: Comment | Text;
  end: Comment | Text | null;
}

interface PartialReq {
  kind: typeof RootKind.Partial;
  name: string;
  delegates: string[];
  delegateGroups: Record<string, string[]>;
  host?: ElementFacetReq;
  start: Comment | Text;
  end: Comment | Text | null;
}

export interface ReviveContext {
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
      delegates: [],
      delegateGroups: {},
      start: hidden as Comment,
      end: null,
    };
  }
  return {
    kind: RootKind.Partial,
    name: parts[0],
    delegates: [],
    delegateGroups: {},
    start: hidden as Comment,
    end: null,
  };
}

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

/**
 * Placeholders standing in for an island whose module never loaded. The tree
 * renderer keeps their markup as plain children and has nowhere to hand a slot
 * to, so slots are rendered in place instead of becoming props.
 */
const ISLAND_PASSTHROUGH = new WeakSet<VNode>();

export function createReviveCtx(): ReviveContext {
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
 * Gives each signal child its own VNode boundary. The signal instance itself is
 * shared state, so using it directly as a VNode lets separate partial trees
 * overwrite Preact's per-VNode bookkeeping on that shared object.
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

export function walkInner(
  ctx: ReviveContext,
  node: Node,
  host?: ElementFacetReq,
): void {
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
      host === undefined && ctx.stack.length === 0 && ctx.signalStack.length === 0 &&
      (node.hasAttribute(FACET_SIGNAL_ATTR) ||
        node.hasAttribute(FACET_HANDLER_ATTR))
    ) {
      host = { kind: FacetKind.Element, el: node, delegates: [] };
      ctx.facets.push(host);
    }
    let child = node.firstChild;
    while (child !== null) {
      // Marker comments are replaced during the visit, so save their sibling first.
      const next = child.nextSibling;
      walkInner(ctx, child, host);
      child = next;
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
      if (ctx.stack.length > 0 && marker.kind === "partial") {
        const owner = ctx.stack[0];
        let parentPartial: PartialReq | undefined;
        for (let i = ctx.stack.length - 1; i >= 0; i--) {
          if (ctx.stack[i].kind === RootKind.Partial) {
            parentPartial = ctx.stack[i] as PartialReq;
            break;
          }
        }
        if (parentPartial === undefined) {
          owner.delegates.push(`partial:${marker.parts[0]}`);
        } else {
          const group = owner.delegateGroups[`partial:${parentPartial.name}`] ??=
            [];
          group.push(`partial:${marker.parts[0]}`);
        }
      }
      const found = openRoot(node, marker.kind, marker.parts);
      if (ctx.stack.length === 0) {
        found.host = host;
        ctx.roots.push(found);
      }
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
      if (host === undefined && ctx.stack.length === 0 && ctx.signalStack.length === 1) {
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
    _humStartMarker: startMarker,
    _humEndMarker: endMarker,
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
      let child = startMarker.nextSibling;
      while (child !== null && child !== endMarker) {
        if (child.contains(node)) return true;
        child = child.nextSibling;
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
    // Copied rather than aliased: the caller mutates the list it gets back, and
    // the array it came from is the `children` a mounted component is still
    // rendering from.
    ? oldChildren.slice()
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
      const el = sib;
      const marker = markerStack.at(-1);
      const append = marker === Marker.Slot || marker === Marker.Partial;
      // Island output and signal text belong to their components. Only adopt
      // elements in a slot or partial, but keep looking for nested slot markers.
      if (append) {
        const props: Record<string, unknown> = {};
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

/**
 * Finalize owners recorded during the DOM walk. Hosts adopt their nested roots
 * and signal facets; independent element facets still mount before signals.
 */
export function planFacets(ctx: ReviveContext): FacetReq[] {
  const out: FacetReq[] = ctx.facets.filter((facet) => facet.kind === FacetKind.Element);
  if (out.length === 0) return ctx.facets;
  ctx.roots = ctx.roots.filter((root) => {
    const host = root.host;
    if (host === undefined) return true;
    if (root.kind === RootKind.Partial) {
      host.delegates.push(`partial:${root.name}`);
    }
    // Hosted roots bypass boot's standalone-root validation.
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
  for (const facet of ctx.facets) {
    if (facet.kind === FacetKind.Signal) out.push(facet);
  }
  return out;
}
