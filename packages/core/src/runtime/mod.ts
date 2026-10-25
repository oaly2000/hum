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
import { ISLAND_REGISTRY } from "./registry.js";
import { PartialComp } from "./partial_component.js";
import { revive } from "./reviver.js";
import { boot } from "./boot.js";
import { applyPartials, startPartialNavigation } from "./partials.js";

export { boot, revive, ISLAND_REGISTRY as hum_island_registry, PartialComp };
export { applyPartials, startPartialNavigation };
