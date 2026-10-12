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
import {
  type AnyVNode,
  DATA_HUM_KEY,
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
} as const;
export type Marker = (typeof Marker)[keyof typeof Marker];

interface IslandReq {
  kind: typeof RootKind.Island;
  name: string;
  propsIdx: number;
  key: string | null;
  start: Comment | Text;
  end: Comment | Text | null;
}

interface PartialReq {
  kind: typeof RootKind.Partial;
  name: string;
  key: string | null;
  start: Comment | Text;
  end: Comment | Text | null;
}

interface ReviveContext {
  roots: Array<IslandReq | PartialReq>;
  stack: Array<PartialReq | IslandReq>;
  slots: Map<number, { name: string; start: Comment; end: Comment | null }>;
  slotIdStack: number[];
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

export type DeserializedProps = Array<{
  props: Record<string, unknown>;
  slots?: SlotRef[];
}>;

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

export function isHumMarkerText(node: Node): node is HumMarkerText {
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

export const CUSTOM_PARSER: CustomParser = {
  Signal: (value: unknown) => signal(value),
  Computed: (value: unknown) => computed(() => value),
  Slot: (value: { name: string; id: number }): SlotRef => ({
    kind: SLOT_SYMBOL,
    name: value.name,
    id: value.id,
  }),
};

export function createReviveCtx(): ReviveContext {
  return { roots: [], stack: [], slots: new Map(), slotIdStack: [] };
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
    for (let i = 0; i < node.childNodes.length; i++) {
      walkInner(ctx, node.childNodes[i]);
    }
    return;
  }

  if (isCommentNode(node)) {
    const comment = node.data;
    const marker = parseMarker(comment);
    if (marker === null) return;

    if (marker.kind === "island") {
      const hidden = maybeHideMarker(node);
      const found: IslandReq = {
        kind: RootKind.Island,
        name: marker.parts[0],
        propsIdx: Number(marker.parts[1]),
        key: marker.parts[2] === "" ? null : marker.parts[2],
        start: hidden as Comment,
        end: null,
      };
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

    if (marker.kind === "partial") {
      const hidden = maybeHideMarker(node);
      const found: PartialReq = {
        kind: RootKind.Partial,
        name: marker.parts[0],
        key: marker.parts[2] === "" ? null : marker.parts[2],
        start: hidden as Comment,
        end: null,
      };
      if (ctx.stack.length === 0) ctx.roots.push(found);
      ctx.stack.push(found);
      return;
    }

    if (marker.kind === "close-island" || marker.kind === "close-partial") {
      const hidden = maybeHideMarker(node);
      const item = ctx.stack.pop();
      if (item !== undefined) item.end = hidden as Comment;
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

export function isTextNode(node: Node): node is Text {
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
 * Rebuilds a VNode tree from the DOM between `node` and `end`. Used for slots
 * and partial regions: the children rendered by the server are turned back
 * into VNodes so Preact can take over the region.
 */
export function domToVNode(
  allProps: DeserializedProps,
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
        domToVNode(allProps, vnodeStack, markerStack, first, end);
      }
    } else if (isElementNode(sib)) {
      const props: Record<string, unknown> = {};
      const el = sib;
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        if (attr.nodeName === DATA_HUM_KEY) {
          props.key = attr.nodeValue ?? undefined;
          continue;
        }
        // Boolean attributes are `true` whenever they are present.
        props[attr.nodeName] =
          typeof (el as any)[attr.nodeName] === "boolean"
            ? true
            : attr.nodeValue;
      }

      const vnode = h(el.localName, props);
      const marker = markerStack.at(-1);
      const append = marker === Marker.Slot || marker === Marker.Partial;
      if (append) {
        addVNodeChild(vnodeStack.at(-1)!, vnode);
        vnodeStack.push(vnode);
      }

      if (el.firstChild !== null) {
        domToVNode(allProps, vnodeStack, markerStack, el.firstChild, end);
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
          const island = ISLAND_REGISTRY.get(name);
          if (island === undefined) {
            throw new Error(`Hum: encountered unknown island "${name}".`);
          }
          const props = allProps[Number(marker.parts[1])].props;
          props.key = marker.parts[2] === "" ? undefined : marker.parts[2];

          const islandVNode = h(island as never, props);
          addVNodeChild(vnodeStack.at(-1)!, islandVNode);
          vnodeStack.push(islandVNode);
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
          (parent.props as Record<string, unknown>)[name] = vnode;
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
        } else if (marker.kind === "key") {
          if (!SHOW_MARKERS) {
            const current = sib;
            sib = sib.nextSibling;
            current.remove();
          }
          const vnode = h(Fragment, { key: marker.parts[0] }) as AnyVNode;
          addVNodeChild(vnodeStack.at(-1)!, vnode);
          vnodeStack.push(vnode);
          continue;
        } else if (
          marker.kind === "close-island" || marker.kind === "close-slot" ||
          marker.kind === "close-partial"
        ) {
          vnodeStack.pop();
          markerStack.pop();
          sib = maybeHideMarker(sib as Comment);
        } else if (marker.kind === "close-key") {
          vnodeStack.pop();
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
  allProps: DeserializedProps,
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
          allProps,
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
        domToVNode(allProps, [root], [Marker.Slot], template.content, null);
        props[propName] = root;
      }
    }

    render(h(component as never, props as never), container);
  };

  // `scheduler.postTask` keeps long hydration work off the critical path.
  const scheduler = (globalThis as { scheduler?: { postTask?: (cb: () => void) => void } })
    .scheduler;
  if (typeof scheduler?.postTask === "function") {
    scheduler.postTask(doRender);
  } else {
    setTimeout(doRender, 0);
  }
}

/**
 * Entry point of the client runtime. Scans the server rendered DOM for island
 * markers and hydrates each of them with the props that were serialized into
 * the document.
 */
export function boot(
  initialIslands: Record<string, ComponentType>,
  islandProps: string,
): void {
  const ctx = createReviveCtx();
  walkInner(ctx, document.body);

  for (const name in initialIslands) {
    ISLAND_REGISTRY.set(name, initialIslands[name]);
  }

  const allProps = parse<DeserializedProps>(islandProps, CUSTOM_PARSER);

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
      const entry = allProps[root.propsIdx];
      if (entry === undefined) continue;
      const component = ISLAND_REGISTRY.get(root.name);
      if (component === undefined) {
        console.error(`Hum: unknown island "${root.name}".`);
        continue;
      }
      revive(entry.props, component, container, ctx.slots, allProps);
    } else {
      const props: Record<string, unknown> = {
        name: root.name,
        mode: PartialMode.Replace,
        children: null,
      };
      const domRoot = h(Fragment, null) as VNode<Record<string, unknown>>;
      domToVNode(allProps, [domRoot], [Marker.Partial], container, root.end);
      props.children = domRoot.props.children;
      revive(
        props,
        PartialComp as unknown as ComponentType,
        container,
        ctx.slots,
        allProps,
      );
    }
  }
}
