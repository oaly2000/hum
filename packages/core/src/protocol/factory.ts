/**
 * Property stamped on every value a factory produced. It is what lets the
 * server serialize a handler that would otherwise be an un-serializable
 * closure, and what lets the client rebuild it: the marker carries the factory
 * ID plus the arguments it was called with.
 */
const FACTORY_MARKER = "__humFactory";

interface FactoryMarker {
  /** Compiler-generated identity, or a framework-owned built-in ID. */
  factory: string;
  /** Arguments the factory was called with, in declaration order. */
  args: unknown[];
}

/**
 * Factories available to the client runtime, keyed by the name used in the
 * payload. The client rebuilds handlers by calling these again with the revived
 * arguments, which is why a handler must be created by a factory instead of a
 * closure.
 */
export const hum_factories: Record<string, (...args: any[]) => unknown> =
  Object.create(null);

/** Returns the factory marker of a value, if it was produced by a factory. */
export function factoryMarkerOf(value: unknown): FactoryMarker | undefined {
  if (value === null || typeof value !== "object" && typeof value !== "function") {
    return undefined;
  }
  return (value as { [FACTORY_MARKER]?: FactoryMarker })[FACTORY_MARKER];
}

export function registerFactory<A extends unknown[], R>(
  name: string,
  fn: (...args: A) => R,
): (...args: A) => R {
  if (hum_factories[name] !== undefined) {
    console.warn(
      `Hum: the handler factory "${name}" was defined twice; the last ` +
        `definition wins. Factory IDs travel in the payload, so they have to ` +
        `stay unique.`,
    );
  }

  const wrapper = (...args: A): R => {
    const value = fn(...args);
    if (
      value !== null && (typeof value === "object" || typeof value === "function")
    ) {
      Object.defineProperty(value, FACTORY_MARKER, {
        value: { factory: name, args } satisfies FactoryMarker,
        configurable: true,
        writable: true,
        enumerable: false,
      });
    }
    return value;
  };
  hum_factories[name] = wrapper as (...args: any[]) => unknown;
  return wrapper;
}
