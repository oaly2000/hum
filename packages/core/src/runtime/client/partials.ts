import { h, type ComponentChildren, type VNode } from "preact";

import { parse } from "../../jsonify/parse.js";
import type { PartialStateJson } from "../server/document.js";
import {
  CLIENT_NAV_ATTR,
  matchesUrl,
  PartialMode,
  UrlMatchKind,
} from "../shared_internal.js";
import {
  ACTIVE_PARTIALS,
  copyOldChildren,
  createRootFragment,
  CUSTOM_PARSER,
  type DeserializedProps,
  domToVNode,
  ISLAND_REGISTRY,
  isCommentNode,
  isElementNode,
  Marker,
  maybeHideMarker,
  PartialComp,
} from "./reviver.js";

/** Opt-in attribute for links and forms that should update a partial region. */
export const PARTIAL_ATTR = "f-partial";

/** Id of the JSON script that carries island info for a partial response. */
export const PARTIAL_STATE_ID = "__HUM_STATE__";

class NoPartialsError extends Error {}

interface HumHistoryState {
  humClientNav: boolean;
  index: number;
  scrollX?: number;
  scrollY?: number;
}

let index = (history.state?.index as number | undefined) ?? 0;
if (!history.state) {
  const state: HumHistoryState = { humClientNav: true, index, scrollX, scrollY };
  history.replaceState(state, document.title);
}

function clientNavEnabled(el: Element): boolean {
  const setting = el.closest(`[${CLIENT_NAV_ATTR}]`);
  if (setting === null) return false;
  return setting.getAttribute(CLIENT_NAV_ATTR) !== "false";
}

function maybePushHistory(nextUrl: URL): void {
  if (nextUrl.href === globalThis.location.href) return;
  const current: HumHistoryState = {
    humClientNav: true,
    index,
    scrollX: globalThis.scrollX,
    scrollY: globalThis.scrollY,
  };
  history.replaceState(current, "", location.href);
  index++;
  history.pushState(
    {
      humClientNav: true,
      index,
      scrollX: globalThis.scrollX,
      scrollY: globalThis.scrollY,
    } satisfies HumHistoryState,
    "",
    nextUrl.href,
  );
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

async function fetchPartials(
  actualUrl: URL,
  partialUrl: URL,
  shouldNavigate: boolean,
  init: RequestInit = {},
): Promise<void> {
  const target = new URL(partialUrl);
  target.searchParams.set("_hum_partial", "true");

  const res = await fetch(target, { ...init, redirect: "follow" });
  let finalUrl = actualUrl;
  if (res.redirected) {
    const nextUrl = new URL(res.url);
    if (nextUrl.origin === actualUrl.origin) finalUrl = nextUrl;
  }
  finalUrl.searchParams.delete("_hum_partial");

  try {
    await applyPartials(res);
  } catch (err) {
    if (err instanceof NoPartialsError && res.redirected) {
      location.href = finalUrl.href;
      return;
    }
    throw err;
  }

  if (shouldNavigate) maybeReplaceHistory(finalUrl);
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
  maybePushHistory(nextUrl);

  const partialUrl = new URL(partial ?? nextUrl.href, location.href);
  await fetchPartials(nextUrl, partialUrl, true);
  updateLinks(nextUrl);
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
    await fetchPartials(url, url, true);
    updateLinks(url);
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
}

/** Applies the partials of an already fetched HTML response to the page. */
export async function applyPartials(res: Response): Promise<void> {
  const contentType = res.headers.get("Content-Type") ?? "";
  if (!contentType.startsWith("text/html")) {
    throw new Error(
      `Hum: expected an HTML response for partial navigation, got "${contentType}".`,
    );
  }

  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, "text/html");

  let allProps: DeserializedProps = [];
  const stateScript = doc.querySelector(`#${PARTIAL_STATE_ID}`);
  if (stateScript !== null && stateScript.textContent !== null) {
    const json = JSON.parse(stateScript.textContent) as PartialStateJson;
    allProps = parse<DeserializedProps>(json.props, CUSTOM_PARSER);
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
  }

  if (doc.title) document.title = doc.title;
  applyHead(doc);

  const ctx: PartialReviveCtx = { foundPartials: 0 };
  if (doc.body !== null) revivePartials(ctx, allProps, doc.body);

  if (ctx.foundPartials === 0) {
    throw new NoPartialsError(
      `Hum: the response for ${res.url} contained no partial regions.`,
    );
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
  allProps: DeserializedProps,
  node: Element,
): void {
  let startNode: Comment | null = null;
  let depth = 0;
  let name = "";
  let key = "";
  let mode: PartialMode = PartialMode.Replace;

  let sib: ChildNode | null = node.firstChild;
  while (sib !== null) {
    if (isCommentNode(sib)) {
      const parts = sib.data.split(":");
      if (parts[0] === "hum" && parts[1] === "partial") {
        // `maybeHideMarker` removes the comment and returns a text node that
        // stays in the DOM. `startNode` must reference that surviving node,
        // otherwise the fragment below spans no content.
        const hidden = maybeHideMarker(sib);
        if (++depth === 1) {
          startNode = hidden;
          name = parts[2];
          mode = Number(parts[3]) as PartialMode;
          key = parts[4] ?? "";
        }
        sib = hidden;
      } else if (sib.data === "/hum:partial") {
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

          domToVNode(allProps, [root], [Marker.Partial], container, endMarker);

          const instance = ACTIVE_PARTIALS.get(name);
          if (instance === undefined) {
            console.warn(
              `Hum: partial "${name}" is not part of the current page. Skipping it.`,
            );
          } else {
            applyPartialMode(instance, root.props.children, mode);
            instance.setState({});
          }
        }
      }
    } else if (depth === 0 && isElementNode(sib)) {
      revivePartials(ctx, allProps, sib);
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
