import { h, type ComponentChildren, type VNode } from "preact";

import { parse } from "../jsonify/parse.js";
import type { PartialStateJson } from "../protocol/payload.js";
import {
  parseMarker,
  PARTIAL_CLOSE,
  PARTIAL_STATE_ID,
  PartialMode,
} from "../protocol/markers.js";
import { ACTIVE_PARTIALS, PartialComp } from "./partial_component.js";
import {
  copyOldChildren,
  createRootFragment,
  domToVNode,
  isCommentNode,
  isElementNode,
  Marker,
  maybeHideMarker,
} from "./dom.js";
import { CUSTOM_PARSER } from "./payload.js";
import { currentInteractionManager } from "./boot.js";
import { type Payload } from "../protocol/payload.js";
import { ISLAND_REGISTRY } from "./registry.js";

import { lastNavigation, NoPartialsError } from "./navigation.js";
export { startPartialNavigation } from "./navigation.js";

interface PartialReviveCtx {
  foundPartials: number;
  updates: PendingPartialUpdate[];
  generation: number;
}

interface PendingPartialUpdate {
  name: string;
  delegates: string[];
  apply: () => void;
}

/**
 * Applies the partials of an already fetched HTML response to the page.
 *
 * `generation` is the navigation that fetched it, when it came from one: a
 * response carrying an older generation than the current navigation is
 * dropped, so overlapping requests cannot append or overwrite each other.
 */
export async function applyPartials(
  res: Response,
  generation = lastNavigation,
  afterUpdate?: () => void,
): Promise<void> {
  if (generation !== lastNavigation) return;

  const contentType = res.headers.get("Content-Type") ?? "";
  if (!contentType.startsWith("text/html")) {
    throw new Error(
      `Hum: expected an HTML response for partial navigation, got "${contentType}".`,
    );
  }

  const text = await res.text();
  // Body parsing and island loading are both awaited, and the navigation may
  // have been replaced while waiting: check again before touching the document.
  if (generation !== lastNavigation) return;
  const doc = new DOMParser().parseFromString(text, "text/html");

  let payload: Payload = [];
  const stateScript = doc.querySelector(`#${PARTIAL_STATE_ID}`);
  if (stateScript !== null && stateScript.textContent !== null) {
    const json = JSON.parse(stateScript.textContent) as PartialStateJson;
    await Promise.all((json.factories ?? []).map((url) => import(/* @vite-ignore */ url)));
    await Promise.all(
      json.islands.map(async (island) => {
        const mod = await import(/* @vite-ignore */ island.url) as Record<
          string,
          unknown
        >;
        ISLAND_REGISTRY.set(
          island.name,
          mod[island.exportName] as never,
        );
      }),
    );
    if (generation !== lastNavigation) return;
    payload = parse<Payload>(json.props, CUSTOM_PARSER);
  }

  // Loading the island modules is awaited as well, so the generation can have
  // moved on by now.
  if (generation !== lastNavigation) return;

  const ctx: PartialReviveCtx = {
    foundPartials: 0,
    updates: [],
    generation,
  };
  if (doc.body !== null) revivePartials(ctx, payload, doc.body);

  if (ctx.foundPartials === 0) {
    throw new NoPartialsError(
      `Hum: the response for ${res.url} contained no partial regions.`,
    );
  }

  await loadStylesheets(doc);
  if (generation !== lastNavigation) return;

  const manager = currentInteractionManager();
  let headApplied = false;
  const updates = ctx.updates.map((update) => ({
      kind: "partial" as const,
      key: update.name,
      delegates: update.delegates,
      apply: () => {
        if (generation !== lastNavigation) return;
        update.apply();
        if (!headApplied) {
          headApplied = true;
          if (doc.title) document.title = doc.title;
          applyHead(doc);
        }
      },
    }));

  const applyUpdates = async (waitForCommit: boolean) => {
    const applied = waitForCommit
      ? await manager?.updateManyAndWait(updates) ??
        updates.map(() => false)
      : manager?.updateMany(updates) ?? updates.map(() => false);
    for (let i = 0; i < applied.length; i++) {
      if (!applied[i]) {
        console.warn(
          `Hum: partial "${ctx.updates[i].name}" is not part of the current page. Skipping it.`,
        );
      }
    }
    afterUpdate?.();
  };

  const startViewTransition = document.startViewTransition;
  if (typeof startViewTransition === "function" && manager !== null) {
    const transition = startViewTransition.call(document, () =>
      applyUpdates(true)
    );
    await transition.updateCallbackDone;
  } else {
    await applyUpdates(false);
  }
}

const pendingStylesheets = new WeakMap<HTMLLinkElement, Promise<void>>();

/** Load response styles before committing its partial DOM. Keep loaded styles
 * available for layouts and partials that survive subsequent navigations. */
async function loadStylesheets(doc: Document): Promise<void> {
  await Promise.all(Array.from(doc.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((link) => {
    if (!link.getAttribute("href")) return;
    const existing = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
      .find((current) => current.href === link.href);
    if (existing) return pendingStylesheets.get(existing);
    const pending = new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        link.removeEventListener("load", loaded);
        link.removeEventListener("error", failed);
        pendingStylesheets.delete(link);
      };
      const loaded = () => { cleanup(); resolve(); };
      const failed = () => {
        cleanup();
        link.remove();
        reject(new Error(`Hum: failed to load stylesheet "${link.href}".`));
      };
      link.addEventListener("load", loaded);
      link.addEventListener("error", failed);
    });
    pendingStylesheets.set(link, pending);
    document.head.appendChild(link);
    return pending;
  }));
}

function applyHead(doc: Document): void {
  // `<link>` nodes have to be snapshotted first: appending them while
  // iterating a live NodeList skips entries.
  const children = Array.from(doc.head.childNodes);

  for (const child of children) {
    if (child.nodeName === "TITLE") continue;

    if (child.nodeName === "META") {
      const meta = child as HTMLMetaElement;
      if (meta.hasAttribute("charset")) continue;
      const selector = meta.name !== ""
        ? `meta[name="${meta.name}"]`
        : `meta[property="${meta.getAttribute("property")}"]`;
      const existing = document.head.querySelector(selector);
      if (existing !== null) {
        existing.setAttribute("content", meta.content);
      } else {
        document.head.appendChild(meta);
      }
    } else if (child.nodeName === "LINK") {
      const link = child as HTMLLinkElement;
      if (link.rel === "modulepreload") continue;
      if (link.rel !== "stylesheet") continue;
      const exists = Array.from(document.head.querySelectorAll("link")).some(
        (existing) => (existing as HTMLLinkElement).href === link.href,
      );
      if (!exists) document.head.appendChild(link);
    } else if (child.nodeName === "SCRIPT") {
      const script = child as HTMLScriptElement;
      const type = script.type;
      if (type === "" || type === "module" || type === "text/javascript") {
        continue;
      }
      const selector = script.id !== ""
        ? `script[type="${type}"][id="${script.id}"]`
        : `script[type="${type}"]`;
      const existing = document.head.querySelector(selector);
      if (existing === null) {
        document.head.appendChild(script);
      } else if (existing.textContent !== script.textContent) {
        existing.textContent = script.textContent;
      }
    } else if (child.nodeName === "STYLE") {
      const style = child as HTMLStyleElement;
      if (style.id === "") document.head.appendChild(style);
    }
  }
}

function revivePartials(
  ctx: PartialReviveCtx,
  payload: Payload,
  node: Element,
): void {
  let startNode: Comment | null = null;
  let depth = 0;
  let name = "";
  let key = "";
  let mode: PartialMode = PartialMode.Replace;
  let delegates: string[] = [];

  let sib: ChildNode | null = node.firstChild;
  while (sib !== null) {
    if (isCommentNode(sib)) {
      // Parsing goes through the shared marker parser so this stays in sync
      // with the server that emitted the marker, instead of re-spelling the
      // `hum:partial:...` wire format here.
      const marker = parseMarker(sib.data);
      if (marker !== null && marker.kind === "partial") {
        // `maybeHideMarker` removes the comment and returns a text node that
        // stays in the DOM. `startNode` must reference that surviving node,
        // otherwise the fragment below spans no content.
        const hidden = maybeHideMarker(sib);
        if (depth === 1 && !delegates.includes(marker.parts[0])) {
          delegates.push(marker.parts[0]);
        }
        if (++depth === 1) {
          startNode = hidden;
          name = marker.parts[0];
          mode = Number(marker.parts[1]) as PartialMode;
          key = marker.parts[2] ?? "";
          delegates = [];
        }
        sib = hidden;
      } else if (sib.data === PARTIAL_CLOSE) {
        sib = maybeHideMarker(sib);
        ctx.foundPartials++;

        if (--depth > 0) {
          sib = sib.nextSibling;
          continue;
        }

        if (startNode !== null) {
          const endMarker = sib as Comment;
          const container = createRootFragment(node, startNode, endMarker);

          const root = h(PartialComp, {
            name,
            mode,
            key: key !== "" ? key : undefined,
            children: null,
          } as never) as unknown as VNode<Record<string, unknown>>;

          domToVNode(payload, [root], [Marker.Partial], container, endMarker);

          const updateName = name;
          const updateMode = mode;
          ctx.updates.push({
            name: updateName,
            delegates,
            apply: () => {
              if (ctx.generation !== lastNavigation) return;
              const instance = ACTIVE_PARTIALS.get(updateName);
              if (instance === undefined) {
                console.warn(
                  `Hum: partial "${updateName}" is not mounted on the current page. Skipping it.`,
                );
                return;
              }
              applyPartialMode(instance, root.props.children, updateMode);
              instance.setState({});
            },
          });
        }
      }
    } else if (depth === 0 && isElementNode(sib)) {
      revivePartials(ctx, payload, sib);
    }

    sib = sib.nextSibling;
  }
}

function applyPartialMode(
  instance: PartialComp,
  children: ComponentChildren,
  mode: PartialMode,
): void {
  if (mode === PartialMode.Replace) {
    instance.props.children = children;
    return;
  }

  const old = instance.props.children;
  copyOldChildren(instance.props as Record<string, unknown>, old);
  const list = instance.props.children as ComponentChildren[];
  if (mode === PartialMode.Append) {
    list.push(children as ComponentChildren);
  } else {
    list.unshift(children as ComponentChildren);
  }
}
