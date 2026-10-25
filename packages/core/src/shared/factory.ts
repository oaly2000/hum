import { registerFactory } from "../protocol/factory.js";

/**
 * Declares a handler factory at module scope. The Hum Vite plugin generates its
 * identity and extracts its browser implementation; exporting is optional.
 * Arguments follow the same rules as page props: plain data, signals, or other
 * factory results.
 */
export function defineFactory<A extends unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => R;
export function defineFactory<A extends unknown[], R>(
  fn: (...args: A) => R,
  id?: string,
): (...args: A) => R {
  if (id === undefined) {
    throw new Error("Hum: defineFactory() needs the Hum Vite plugin. Declare the factory at module scope so the plugin can generate its identity.");
  }
  return registerFactory(id, fn);
}
