import type { VNode } from "preact";

/**
 * Preact `options` hook names. `preact` exposes these as plain string keys on
 * the global `options` object (they are the Preact 10 names, still used by
 * `preact` 11 and by `preact-render-to-string`).
 */
export const OptionsType = {
  ATTR: "attr",
  VNODE: "vnode",
  DIFF: "__b",
  RENDER: "__r",
  DIFFED: "diffed",
  ERROR: "__e",
  COMMIT: "__c",
  ROOT: "__",
} as const;

/**
 * Hum manipulates rendered trees generically (wrapping vnodes, injecting
 * markers), which requires props to be unconstrained.
 */
export type AnyVNode = VNode<any>;

