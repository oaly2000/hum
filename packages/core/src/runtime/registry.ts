import type { ComponentType } from "preact";

/** Registered island components, keyed by island name. */
export const ISLAND_REGISTRY = new Map<string, ComponentType>();
export const ISLAND_LOADERS = new Map<string, () => Promise<ComponentType>>();
