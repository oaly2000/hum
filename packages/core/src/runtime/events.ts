import type { Signal } from "@preact/signals";

/**
 * Property stamped on every value a factory produced. It is what lets the
 * server serialize a handler that would otherwise be an un-serializable
 * closure, and what lets the client rebuild it: the marker carries the factory
 * name plus the arguments it was called with.
 */
const FACTORY_MARKER = "__humFactory";

interface FactoryMarker {
  /** Name the factory is exported under, e.g. `"setFromProp"`. */
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

/**
 * Wraps a handler factory so its result carries a serializable marker, and
 * registers it under `name` for the client runtime.
 *
 * `name` travels in the payload instead of the function, so it has to be unique
 * in the app and stable across versions. The module a factory is defined in
 * must also be evaluated in the browser—import it from the client entry, or
 * from an island the page loads—otherwise the client has no implementation to
 * rebuild the handler with. Arguments follow the same rules as any other page
 * level prop: plain data, signals, or other factory results.
 */
export function defineFactory<A extends unknown[], R>(
  name: string,
  fn: (...args: A) => R,
): (...args: A) => R {
  if (hum_factories[name] !== undefined) {
    console.warn(
      `Hum: the handler factory "${name}" was defined twice; the last ` +
        `definition wins. Factory names travel in the payload, so they have to ` +
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

/**
 * Coerces a value read off a DOM property to the type the signal currently
 * holds, so `<input type="number">` (whose `value` is a string) round-trips
 * through a `Signal<number>`. Unparseable input is passed through unchanged,
 * which lets a partially typed value survive.
 */
export function coerceToSignalType(value: unknown, previous: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof previous === "number" || typeof previous === "bigint") {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() === "") return 0;
    const num = Number(value);
    return Number.isNaN(num) ? value : num;
  }
  return value;
}

interface AddOptions {
  /** Upper bound, inclusive. */
  max?: number;
  /** Lower bound, inclusive. */
  min?: number;
}

/**
 * Returns an event handler that adds `delta` to a numeric signal, clamped to
 * `options.min` / `options.max`.
 */
export const add = defineFactory(
  "add",
  (
    signal: Signal<number>,
    delta: number,
    options?: AddOptions,
  ): ((event: Event) => void) => {
    const max = options?.max ?? Infinity;
    const min = options?.min ?? -Infinity;
    return () => {
      signal.value = Math.min(Math.max(signal.value + delta, min), max);
    };
  },
);

/** Returns an event handler that sets a signal to a fixed value. */
export const setValue = defineFactory(
  "setValue",
  <T>(signal: Signal<T>, value: T): ((event: Event) => void) =>
    () => {
      signal.value = value;
    },
);

/** Returns an event handler that flips a boolean signal. */
export const toggle = defineFactory(
  "toggle",
  (signal: Signal<boolean>): ((event: Event) => void) => () => {
    signal.value = !signal.value;
  },
);

/**
 * Returns an event handler that copies a property off the event's
 * `currentTarget` (e.g. `"value"`, `"checked"`, `"open"`) into a signal, so a
 * native form control can drive a signal without a component in between.
 */
export const setFromProp = defineFactory(
  "setFromProp",
  (
    signal: Signal<unknown>,
    key: string,
  ): ((event: Event) => void) =>
    (event: Event) => {
      const target = event.currentTarget as
        | (EventTarget & Record<string, unknown>)
        | null;
      const raw = target === null ? undefined : target[key];
      signal.value = coerceToSignalType(raw, signal.peek());
    },
);
