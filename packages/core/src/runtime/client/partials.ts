import { h, type ComponentChildren, type VNode } from "preact";

import { parse } from "../../jsonify/parse.js";
import type { PartialStateJson } from "../server/document.js";
import {
  CLIENT_NAV_ATTR,
  matchesUrl,
  parseMarker,
  PARTIAL_CLOSE,
  PARTIAL_SEARCH_PARAM,
  PARTIAL_STATE_ID,
  PartialMode,
  UrlMatchKind,
} from "../shared_internal.js";
import {
  ACTIVE_PARTIALS,
  copyOldChildren,
  createRootFragment,
  CUSTOM_PARSER,
  currentInteractionManager,
  type Payload,
  domToVNode,
  ISLAND_REGISTRY,
  isCommentNode,
  isElementNode,
  Marker,
  maybeHideMarker,
  PartialComp,
} from "./reviver.js";

/** Opt-in attribute for links and forms that should update a partial region. */
const PARTIAL_ATTR = "data-hum-partial";

class NoPartialsError extends Error {}

interface HumHistoryState {
  humClientNav: boolean;
  index: number;
  scrollX?: number;
  scrollY?: number;
}

let index = (history.state?.index as number | undefined) ?? 0;

/** Snapshot of the current scroll position and navigation index. */
function snapshotHistoryState(): HumHistoryState {
  return {
    humClientNav: true,
    index,
    scrollX: globalThis.scrollX,
    scrollY: globalThis.scrollY,
  };
}

if (!history.state) {
  history.replaceState(snapshotHistoryState(), document.title);
}

function clientNavEnabled(el: Element): boolean {
  const setting = el.closest(`[${CLIENT_NAV_ATTR}]`);
  if (setting === null) return false;
  return setting.getAttribute(CLIENT_NAV_ATTR) !== "false";
}

function maybePushHistory(nextUrl: URL): void {
  if (nextUrl.href === globalThis.location.href) return;
  history.replaceState(snapshotHistoryState(), "", location.href);
  index++;
  history.pushState(snapshotHistoryState(), "", nextUrl.href);
}

function maybeReplaceHistory(nextUrl: URL): void {
  if (nextUrl.href !== globalThis.location.href) {
    history.replaceState(history.state, "", nextUrl.href);
  }
}

function linkText(url: URL, link: HTMLAnchorElement): UrlMatchKind {
  return matchesUrl(url.pathname, link.getAttribute("href") ?? link.href, url.search);
}

function updateLinks(url: URL): void {
  document.querySelectorAll("a").forEach((link) => {
    const hasHumAria = link.hasAttribute("data-current") ||
      link.hasAttribute("data-ancestor");
    if (!hasHumAria && link.hasAttribute("aria-current")) return;

    const match = linkText(url, link);
    if (match === UrlMatchKind.Current) {
      link.setAttribute("data-current", "true");
      link.setAttribute("aria-current", "page");
      link.removeAttribute("data-ancestor");
    } else if (match === UrlMatchKind.Ancestor) {
      link.setAttribute("data-ancestor", "true");
      link.setAttribute("aria-current", "true");
      link.removeAttribute("data-current");
    } else {
      link.removeAttribute("data-current");
      link.removeAttribute("data-ancestor");
      link.removeAttribute("aria-current");
    }
  });
}

/**
 * Generation of the last partial navigation that started. Every request bumps
 * it, and a response is only allowed to land while it still holds the current
 * value: this is what makes the last navigation win instead of whichever
 * response happens to arrive last.
 */
let lastNavigation = 0;

/**
 * Opens a navigation and returns its generation. A response is applied only
 * while its generation is still the current one, so overlapping navigations
 * cannot append or overwrite each other and a late response cannot roll the
 * page back to an URL it no longer points at.
 */
export function startPartialNavigation(): number {
  return ++lastNavigation;
}

/** Keeps the history entry a request navigates to free of bookkeeping params. */
function stripInternalParams(url: URL): URL {
  const cleaned = new URL(url);
  cleaned.searchParams.delete(PARTIAL_SEARCH_PARAM);
  return cleaned;
}

async function fetchPartials(
  actualUrl: URL,
  partialUrl: URL,
  shouldNavigate: boolean,
  init: RequestInit = {},
  historyMode: "push" | "replace" = "replace",
): Promise<boolean> {
  const target = new URL(partialUrl);
  target.searchParams.set(PARTIAL_SEARCH_PARAM, "true");

  const generation = startPartialNavigation();
  const res = await fetch(target, { ...init, redirect: "follow" });
  if (generation !== lastNavigation) return false;

  let finalUrl = actualUrl;
  if (res.redirected) {
    const nextUrl = new URL(res.url);
    if (nextUrl.origin === actualUrl.origin) finalUrl = nextUrl;
  }
  finalUrl = stripInternalParams(finalUrl);

  try {
    await applyPartials(
      res,
      generation,
      shouldNavigate && generation === lastNavigation
        ? () => {
          if (generation === lastNavigation) updateLinks(finalUrl);
        }
        : undefined,
    );
  } catch (err) {
    // A superseded response must not pull the page anywhere, not even to a
    // redirect target: the navigation that replaced this one owns the URL now.
    if (generation !== lastNavigation) return false;
    if (err instanceof NoPartialsError && res.redirected) {
      location.href = finalUrl.href;
      return false;
    }
    throw err;
  }

  if (generation !== lastNavigation) return false;
  if (shouldNavigate) {
    if (historyMode === "push") maybePushHistory(finalUrl);
    else maybeReplaceHistory(finalUrl);
  }
  return true;
}

document.addEventListener("click", async (event) => {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;

  const target = event.target;
  if (!(target instanceof Element)) return;

  const anchor = target.closest("a");
  if (anchor === null || !(anchor instanceof HTMLAnchorElement)) return;

  const opensNewContext = anchor.target !== "" && anchor.target !== "_self";
  const href = anchor.getAttribute("href") ?? "";
  if (
    opensNewContext || anchor.origin !== location.origin ||
    href.startsWith("#") || href === ""
  ) {
    return;
  }

  if (!clientNavEnabled(anchor)) return;

  const partial = anchor.getAttribute(PARTIAL_ATTR);
  const nextUrl = new URL(anchor.href);

  event.preventDefault();

  const partialUrl = new URL(partial ?? nextUrl.href, location.href);
  // The URL highlight only moves when this navigation is the one that landed:
  // a response a newer click superseded must not repaint the page around it.
  try {
    await fetchPartials(nextUrl, partialUrl, true, {}, "push");
  } catch (err) {
    console.error("Hum: client navigation failed; keeping the current page.", err);
  }
});

addEventListener("popstate", async (event) => {
  const state = event.state as HumHistoryState | null;
  if (state === null || state.humClientNav !== true) return;

  const setting = document.querySelector(`[${CLIENT_NAV_ATTR}]`);
  if (setting === null || setting.getAttribute(CLIENT_NAV_ATTR) === "false") {
    location.reload();
    return;
  }

  index = state.index ?? index;
  const url = new URL(location.href, location.origin);
  try {
    if (!await fetchPartials(url, url, true)) return;
    scrollTo({ left: state.scrollX ?? 0, top: state.scrollY ?? 0, behavior: "instant" });
  } catch (err) {
    if (err instanceof NoPartialsError) {
      location.reload();
      return;
    }
    throw err;
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (
    !(form instanceof HTMLFormElement) || event.defaultPrevented ||
    !clientNavEnabled(form)
  ) {
    return;
  }

  const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
  const method = (
    submitter?.getAttribute("formmethod") ?? form.method
  ).toLowerCase();
  if (method !== "get" && method !== "post") return;

  const rawPartial = submitter?.getAttribute(PARTIAL_ATTR) ??
    submitter?.getAttribute("formaction") ??
    form.getAttribute(PARTIAL_ATTR) ??
    form.getAttribute("action");
  if (
    rawPartial === null ||
    (!submitter?.hasAttribute(PARTIAL_ATTR) &&
      !submitter?.hasAttribute("formaction") &&
      !form.hasAttribute(PARTIAL_ATTR) &&
      !form.hasAttribute("action"))
  ) {
    return;
  }

  const actionUrl = new URL(
    submitter?.getAttribute("formaction") ?? form.action,
    location.href,
  );
  const partialUrl = new URL(rawPartial, location.href);

  let init: RequestInit | undefined;
  if (method === "get") {
    const query = new URLSearchParams(new FormData(form, submitter) as any);
    query.forEach((value, key) => partialUrl.searchParams.append(key, value));
  } else {
    init = { method, body: new FormData(form, submitter) };
  }

  event.preventDefault();
  await fetchPartials(actionUrl, partialUrl, true, init);
});

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
