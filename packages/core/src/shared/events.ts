import type { Signal } from "@preact/signals";
import { registerFactory } from "../protocol/factory.js";

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
export const add = registerFactory(
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
export const setValue = registerFactory(
  "setValue",
  <T>(signal: Signal<T>, value: T): ((event: Event) => void) =>
    () => {
      signal.value = value;
    },
);

/** Returns an event handler that flips a boolean signal. */
export const toggle = registerFactory(
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
export const setFromProp = registerFactory(
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
