import type { ComponentChildren, VNode } from "preact";

export { asset } from "./shared_internal.js";

/** `true` when running in a browser. */
export const IS_BROWSER = typeof document !== "undefined";

export interface PartialProps {
  children?: ComponentChildren;
  /** Unique name of the partial region. */
  name: string;
  /**
   * How the updated HTML is applied during client side navigation.
   * @default "replace"
   */
  mode?: "replace" | "prepend" | "append";
}

/**
 * Flag marking a component as Hum's `Partial`. Detecting partials by this flag
 * (instead of reference equality) lets the server render hooks recognise it
 * even when the shared entry has been loaded more than once — for example in
 * dev, where the Vite plugin and route modules each import their own copy.
 */
export const PARTIAL_FLAG = "__humPartial";

function tagPartial<T extends (...args: never[]) => VNode>(fn: T): T {
  Object.assign(fn, { [PARTIAL_FLAG]: true });
  return fn;
}

/**
 * Marks a region of the page that can be updated on its own. The component
 * itself renders its children unchanged; the server adds marker comments that
 * the client uses to find and swap the region.
 */
export const Partial = tagPartial(function Partial(props: PartialProps): VNode {
  // The marker wrapping happens in the server render hooks.
  return props.children as any;
});
Object.assign(Partial, { displayName: "Partial" });

/** Returns true for any vnode whose type is Hum's `Partial` component. */
export function isPartialType(type: unknown): boolean {
  return typeof type === "function" &&
    (type as unknown as Record<string, unknown>)[PARTIAL_FLAG] === true;
}
