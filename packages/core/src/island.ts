import { h, type ComponentType } from "preact";

import { tagIsland, type IslandTag } from "./routing/island_tag.js";

/**
 * Declares an island at module scope. Export the result from a browser-safe
 * module; the Hum Vite plugin supplies its identity and client build entry.
 */
export function defineIsland<Props>(
  component: ComponentType<Props>,
): ComponentType<Props>;
export function defineIsland<Props>(
  component: ComponentType<Props>,
  tag?: IslandTag,
): ComponentType<Props> {
  if (tag === undefined) {
    throw new Error(
      "Hum: defineIsland() needs the Hum Vite plugin. Declare and export " +
        "the island at module scope so the plugin can generate its identity.",
    );
  }

  // Give each declaration its own identity, including two declarations of the
  // same underlying component. Render through Preact so class components and
  // hooks retain their ordinary component lifecycle.
  const Island: ComponentType<Props> = (props) =>
    h(component as ComponentType<any>, props as any);
  Island.displayName = `Island(${tag.exportName})`;
  return tagIsland(Island, tag);
}
