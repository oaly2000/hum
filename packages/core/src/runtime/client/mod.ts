/**
 * Client runtime entry point. The server generated inline script imports
 * `boot` from here (directly in dev, from the bundled entry in production).
 *
 * Local bindings are used deliberately: bundlers such as Rolldown (Vite 8)
 * tree-shake a module that only re-exports imported bindings when nothing in
 * the bundle consumes them. Importing each export locally and re-exporting the
 * binding keeps `boot`/`revive`/`applyPartials` alive so the generated entry
 * chunk actually exposes them.
 */
import { ISLAND_REGISTRY, PartialComp, revive, boot } from "./reviver.js";
import { applyPartials, startPartialNavigation } from "./partials.js";
import "./partials.js";

export { boot, revive, ISLAND_REGISTRY as hum_island_registry, PartialComp };
export { applyPartials, startPartialNavigation };
