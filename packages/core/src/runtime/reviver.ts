import { Fragment, h, render, type ComponentType, type VNode } from "preact";
import type { AnyVNode } from "../shared/preact.js";
import type { Payload } from "../protocol/payload.js";
import { entrySignal, isSlotRef } from "./payload.js";
import {
  createRootFragment,
  domToVNode,
  Marker,
  SignalText,
  type ReviveContext,
  type SignalFacetReq,
  type ElementFacetReq,
} from "./dom.js";
import { scheduleInteractionMount } from "./interaction_manager.js";

/** Renders an island into the DOM range it was server rendered into. */
export function reviveNow(
  props: Record<string, unknown>,
  component: ComponentType,
  container: HTMLElement,
  slots: ReviveContext["slots"],
  payload: Payload,
): () => void {
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

  return mountVNode(h(component as never, props as never), container);
}

function mountVNode(vnode: AnyVNode, container: HTMLElement): () => void {
  render(vnode as never, container);
  return () => render(null, container);
}

/** Renders an island into the DOM range it was server rendered into. */
export function revive(
  props: Record<string, unknown>,
  component: ComponentType,
  container: HTMLElement,
  slots: ReviveContext["slots"],
  payload: Payload,
): void {
  scheduleInteractionMount(() => {
    reviveNow(props, component, container, slots, payload);
  });
}

/**
 * Hands the text node of a page level signal to a `SignalText` component leaf.
 */
export function hydrateSignalFacet(
  facet: SignalFacetReq,
  payload: Payload,
): () => void {
  if (facet.end === null) return () => {};
  const parent = facet.start.parentNode;
  if (parent === null || facet.end.parentNode !== parent) return () => {};

  const container = createRootFragment(parent, facet.start, facet.end);
  return mountVNode(
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
export function hydrateElementFacet(
  facet: ElementFacetReq,
  payload: Payload,
): () => void {
  const el = facet.el;
  const parent = el.parentNode;
  if (parent === null) return () => {};

  // A root fragment needs an anchor on either side; the element is the range.
  const start = document.createTextNode("");
  const end = document.createTextNode("");
  parent.insertBefore(start, el);
  parent.insertBefore(end, el.nextSibling);

  const container = createRootFragment(parent, start, end);
  const root: AnyVNode = h(Fragment, null);
  domToVNode(payload, [root], [Marker.Slot], el, end);
  const dispose = mountVNode(
    h(Fragment, null, root.props.children as never),
    container,
  );
  return () => {
    try {
      dispose();
    } finally {
      start.remove();
      end.remove();
    }
  };
}
