/**
 * How an island says which island it is.
 *
 * The Vite plugin stamps every island module's default export with this tag
 * while it transforms it, and the renderer reads it back to decide whether a
 * component it is about to render is an island. The tag lives on the component
 * object rather than in a registry keyed by the component, because a component
 * — unlike a table in some module's scope — travels with its own identity: a
 * runtime that instantiates a module more than once, as a Worker runtime's
 * module runner may, still hands the renderer a component that knows its name.
 *
 * The key is a well known symbol, so the code the plugin emits needs no import
 * to write it and two copies of the framework still agree on it.
 */
export const ISLAND_TAG_KEY = "hum.island";

/** The symbol {@link ISLAND_TAG_KEY} resolves to. */
export const ISLAND_TAG = Symbol.for(ISLAND_TAG_KEY);

/** What an island component carries: the identity its markers are made of. */
export interface IslandTag {
  /** Island name as used in markers, e.g. `Counter`. */
  name: string;
  /** Path relative to the project root, used for the client asset URL. */
  file: string;
  /** Named or default export to hydrate with. */
  exportName: string;
}

/** The island a component declares itself to be, or `undefined`. */
export function islandTagOf(component: unknown): IslandTag | undefined {
  const kind = typeof component;
  if (kind !== "function" && (kind !== "object" || component === null)) {
    return undefined;
  }
  return (component as Record<symbol, IslandTag | undefined>)[ISLAND_TAG];
}

/**
 * Marks a component as an island, and returns it.
 *
 * The Vite plugin writes the same tag into every island module it transforms;
 * this is the same write for anything that builds a manifest of its own — tests
 * included, which is why it is exported rather than kept inside the runtime.
 */
export function tagIsland<T>(component: T, tag: IslandTag): T {
  const kind = typeof component;
  if (kind === "function" || (kind === "object" && component !== null)) {
    (component as Record<symbol, IslandTag>)[ISLAND_TAG] = tag;
  }
  return component;
}
