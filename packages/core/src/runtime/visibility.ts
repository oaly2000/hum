import type { ComponentType } from "preact";
import type { Payload } from "../protocol/payload.js";
import type { ReviveContext } from "./dom.js";
import { ISLAND_REGISTRY } from "./registry.js";
import { reviveNow } from "./reviver.js";

function firstElement(container: HTMLElement): Element | undefined {
  const children = (container as unknown as { childNodes: ArrayLike<Node> })
    .childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType === Node.ELEMENT_NODE) return child as Element;
  }
  return undefined;
}

export function mountIslandWhenVisible(
  name: string,
  component: ComponentType | undefined,
  load: (() => Promise<ComponentType>) | undefined,
  props: Record<string, unknown>,
  container: HTMLElement,
  slots: ReviveContext["slots"],
  payload: Payload,
): () => void {
  let cancelled = false;
  let activated = false;
  let disposeRender: (() => void) | undefined;
  let observer: IntersectionObserver | undefined;

  const activate = () => {
    if (activated || cancelled) return;
    activated = true;
    const loaded = component !== undefined
      ? Promise.resolve(component)
      : load === undefined
      ? Promise.reject(
        new Error(`Hum: no component loader is registered for island "${name}".`),
      )
      : Promise.resolve().then(load);
    void loaded.then((resolved) => {
      ISLAND_REGISTRY.set(name, resolved);
      if (cancelled) return;
      disposeRender = reviveNow(props, resolved, container, slots, payload);
      observer?.disconnect();
    }).catch((error: unknown) => {
      activated = false;
      console.error(`Hum: failed to load or hydrate island "${name}".`, error);
    });
  };

  const target = firstElement(container);
  if (target === undefined || typeof IntersectionObserver === "undefined") {
    activate();
  } else {
    observer = new IntersectionObserver((entries) => {
      if (
        entries.some((entry) =>
          entry.isIntersecting || entry.intersectionRatio > 0
        )
      ) activate();
    }, { rootMargin: "200px" });
    observer.observe(target);
  }

  return () => {
    cancelled = true;
    observer?.disconnect();
    disposeRender?.();
  };
}
