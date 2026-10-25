import type { VNode } from "preact";

export const UrlMatchKind = {
  None: 0,
  Ancestor: 1,
  Current: 2,
} as const;
export type UrlMatchKind = (typeof UrlMatchKind)[keyof typeof UrlMatchKind];

/**
 * Compares the currently rendered pathname with a link's `href`, used to mark
 * the active/ancestor navigation links.
 */
export function matchesUrl(
  current: string,
  needle: string,
  currentSearch?: string,
): UrlMatchKind {
  const needleUrl = new URL(needle, "http://localhost");
  let href = needleUrl.pathname;
  const needleSearch = needleUrl.search;

  if (href !== "/" && href.endsWith("/")) href = href.slice(0, -1);
  if (current !== "/" && current.endsWith("/")) current = current.slice(0, -1);

  if (current === href) {
    if (
      needleSearch && currentSearch !== undefined && needleSearch !== currentSearch
    ) {
      return UrlMatchKind.Ancestor;
    }
    return UrlMatchKind.Current;
  } else if (current.startsWith(href + "/") || href === "/") {
    return UrlMatchKind.Ancestor;
  }

  return UrlMatchKind.None;
}

/** Marks the active / ancestor link in a server rendered or hydrated tree. */
export function setActiveUrl(
  vnode: VNode,
  pathname: string,
  search?: string,
): void {
  const props = vnode.props as Record<string, unknown>;
  const hrefProp = props.href;
  if (typeof hrefProp !== "string" || !hrefProp.startsWith("/")) return;
  if (props["aria-current"] !== undefined) return;

  const match = matchesUrl(pathname, hrefProp, search);
  if (match === UrlMatchKind.Current) {
    props["data-current"] = "true";
    props["aria-current"] = "page";
  } else if (match === UrlMatchKind.Ancestor) {
    props["data-ancestor"] = "true";
    props["aria-current"] = "true";
  }
}
