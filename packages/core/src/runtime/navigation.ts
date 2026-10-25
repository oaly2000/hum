import { CLIENT_NAV_ATTR, PARTIAL_SEARCH_PARAM } from "../protocol/markers.js";
import { matchesUrl, UrlMatchKind } from "../shared/url.js";

/** Opt-in attribute for links and forms that should update a partial region. */
const PARTIAL_ATTR = "data-hum-partial";

export class NoPartialsError extends Error {}

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
export let lastNavigation = 0;

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
  const [res, { applyPartials }] = await Promise.all([
    fetch(target, { ...init, redirect: "follow" }),
    import("./partials.js"),
  ]);
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

/** Load response handling only when the application applies a partial. */
export async function applyPartials(
  res: Response,
  generation = lastNavigation,
  afterUpdate?: () => void,
): Promise<void> {
  const runtime = await import("./partials.js");
  await runtime.applyPartials(res, generation, afterUpdate);
}
