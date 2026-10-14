import {
  Fragment,
  isValidElement,
  type ComponentChildren,
  type VNode,
} from "preact";

import type { HeadExport, RouteProps } from "../../types.js";

/**
 * One head tag after normalization. `key === null` means the node carries no
 * identity and is therefore never deduplicated.
 */
interface HeadEntry {
  key: string | null;
  node: ComponentChildren;
}

// Link rels whose presence is conceptually singleton: an override should
// replace the existing tag regardless of its href. Other rels (stylesheet,
// preload, alternate, ...) can legitimately appear multiple times with
// different hrefs, so href must stay part of the identity.
function isSingletonLinkRel(rel: unknown): boolean {
  return rel === "canonical" || rel === "manifest";
}

/**
 * Identity of one head tag. Tags describing the same thing share an identity so
 * that a more specific `head` export can replace a broader one, while the
 * position (set by the outermost export) is preserved.
 */
function headCacheKey(vnode: VNode): string {
  const type = String(vnode.type);
  if (vnode.key !== undefined && vnode.key !== null) return String(vnode.key);
  if (type === "title") return "title";

  const props = vnode.props as Record<string, unknown>;
  const keys = Object.keys(props).sort();
  let key = type;
  for (const name of keys) {
    if (name === "children" || name === "nonce" || name === "ref") continue;
    if (name === "dangerouslySetInnerHTML") {
      key += String((props[name] as { __html?: unknown })?.__html ?? "");
      continue;
    }
    // The value of a meta/link tag is exactly what an override changes, so it
    // must not be part of the tag's identity.
    if (type === "meta" && name === "content") continue;
    if (type === "link" && name === "href" && isSingletonLinkRel(props.rel)) {
      continue;
    }
    key += `::${String(props[name])}`;
  }
  return key;
}

/** Flattens a `head` value into individual tags, unwrapping fragments/arrays. */
function flatten(node: ComponentChildren, out: HeadEntry[]): void {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (Array.isArray(node)) {
    for (const child of node) flatten(child as ComponentChildren, out);
    return;
  }
  if (isValidElement(node)) {
    if (node.type === Fragment) {
      flatten(node.props.children as ComponentChildren, out);
      return;
    }
    out.push(
      typeof node.type === "string"
        ? { key: headCacheKey(node), node }
        : { key: null, node },
    );
    return;
  }
  out.push({ key: null, node: node as ComponentChildren });
}

/** Resolves a `head` export to JSX, supporting both its forms. */
function resolveHead<State = Record<string, unknown>>(
  head: HeadExport<State>,
  props: RouteProps<State>,
): ComponentChildren {
  return typeof head === "function" ? head(props) : head;
}

/**
 * Merges the `head` exports of a render chain, outermost first
 * (`_app` → `_layout`s → page).
 *
 * Merging is data level, not render level: nothing about it depends on the
 * order in which components render. That is why the server can render the head
 * tags in one small pass and inject them into the document `<head>` afterwards,
 * instead of intercepting every head tag in the component tree.
 */
export function mergeHeads(
  chain: Array<{ head?: HeadExport } | undefined>,
  props: RouteProps,
): ComponentChildren[] {
  const byKey = new Map<string, HeadEntry>();
  const unkeyed: HeadEntry[] = [];

  for (const mod of chain) {
    const head = mod?.head;
    if (head === undefined || head === null) continue;

    const entries: HeadEntry[] = [];
    flatten(resolveHead(head, props), entries);

    for (const entry of entries) {
      if (entry.key === null) {
        unkeyed.push(entry);
        continue;
      }
      // `Map.set` keeps the original insertion position, so an overridden tag
      // stays where the broadest head export put it.
      byKey.set(entry.key, entry);
    }
  }

  return [...unkeyed, ...byKey.values()].map((entry) => entry.node);
}
