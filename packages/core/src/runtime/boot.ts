import { Fragment, h, type ComponentType, type VNode } from "preact";
import { parse } from "../jsonify/parse.js";
import { PartialMode } from "../protocol/markers.js";
import type { Payload } from "../protocol/payload.js";
import { CUSTOM_PARSER } from "./payload.js";
import {
  createReviveCtx,
  walkInner,
  planFacets,
  RootKind,
  FacetKind,
  Marker,
  createRootFragment,
  domToVNode,
} from "./dom.js";
import { InteractionManager } from "./interaction_manager.js";
import { PartialComp } from "./partial_component.js";
import { ISLAND_REGISTRY, ISLAND_LOADERS } from "./registry.js";
import { reviveNow, hydrateSignalFacet, hydrateElementFacet } from "./reviver.js";
import { mountIslandWhenVisible } from "./visibility.js";

let activeInteractionManager: InteractionManager | null = null;

export function currentInteractionManager(): InteractionManager | null {
  return activeInteractionManager;
}

/**
 * Entry point of the client runtime. Scans the server rendered DOM for islands,
 * partials and page level facets, and hydrates each of them with what was
 * serialized into the document.
 *
 * The scan is synchronous, but every render is scheduled through {@link
 * InteractionManager}: nothing is live yet when `boot` returns, and the
 * document is only touched from the task after it.
 */
export function boot(
  initialIslands: Record<string, ComponentType>,
  payloadJson: string,
  lazyIslands: Record<string, () => Promise<ComponentType>> = {},
): InteractionManager {
  if (activeInteractionManager !== null) {
    const previousManager = activeInteractionManager;
    if (!previousManager.disposeIfDetached()) {
      throw new Error(
        "hum: the client runtime was booted again while its previous " +
          "interaction units still own connected DOM.",
      );
    }
    activeInteractionManager = null;
  }
  const ctx = createReviveCtx();
  walkInner(ctx, document.body);

  ISLAND_REGISTRY.clear();
  ISLAND_LOADERS.clear();
  for (const name in initialIslands) {
    ISLAND_REGISTRY.set(name, initialIslands[name]);
  }
  for (const name in lazyIslands) {
    ISLAND_LOADERS.set(name, lazyIslands[name]);
  }

  const payload = parse<Payload>(payloadJson, CUSTOM_PARSER);

  // Plan the owners before registration: a host takes over the roots that fall
  // inside it, so they must not become separate interaction units.
  const facets = planFacets(ctx);

  const manager = new InteractionManager();
  const registerBinding = (
    id: string,
    owner: Node,
    mount: () => void | (() => void),
    delegates?: string[],
  ) => {
    manager.register({
      id,
      kind: "binding",
      owner,
      phase: "binding",
      ...(delegates === undefined ? {} : { delegates }),
      mount,
    });
  };

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
      const load = ISLAND_LOADERS.get(root.name);
      if (component === undefined && load === undefined) {
        console.error(`Hum: unknown island "${root.name}".`);
        continue;
      }
      manager.register({
        id: `island:${root.name}:${i}`,
        kind: "island",
        owner: container,
        phase: "root",
        delegates: root.delegates,
        delegateGroups: root.delegateGroups,
        mount: () =>
          mountIslandWhenVisible(
            root.name,
            component,
            load,
            entry.props,
            container,
            ctx.slots,
            payload,
          ),
      });
    } else {
      const props: Record<string, unknown> = {
        name: root.name,
        mode: PartialMode.Replace,
        children: null,
      };
      const domRoot = h(Fragment, null) as VNode<Record<string, unknown>>;
      domToVNode(payload, [domRoot], [Marker.Partial], container, root.end);
      props.children = domRoot.props.children;
      manager.register({
        id: `partial:${root.name}:${i}`,
        kind: "partial",
        key: root.name,
        owner: container,
        phase: "root",
        delegates: root.delegates,
        delegateGroups: root.delegateGroups,
        mount: () =>
          reviveNow(
            props,
            PartialComp as unknown as ComponentType,
            container,
            ctx.slots,
            payload,
          ),
      });
    }
  }

  for (let i = 0; i < facets.length; i++) {
    const facet = facets[i];
    if (facet.kind === FacetKind.Signal) {
      if (facet.end === null || facet.start.parentNode !== facet.end.parentNode) {
        continue;
      }
      const container = createRootFragment(
        facet.start.parentNode as Node,
        facet.start,
        facet.end,
      );
      registerBinding(
        `signal:${facet.idx}:${i}`,
        container,
        () => hydrateSignalFacet(facet, payload),
      );
    } else {
      registerBinding(
        `element:${i}`,
        facet.el,
        () => hydrateElementFacet(facet, payload),
        facet.delegates,
      );
    }
  }

  manager.mount();
  activeInteractionManager = manager;
  return manager;
}
