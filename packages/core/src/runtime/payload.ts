import { computed, signal } from "@preact/signals";
import type { CustomParser } from "../jsonify/parse.js";
import { hum_factories } from "../protocol/factory.js";
// Install built-in factories before restoring handlers in either response kind.
import "../shared/events.js";
import { SLOT_SYMBOL, type SlotRef, type PayloadEntry } from "../protocol/payload.js";

export function isSlotRef(x: unknown): x is SlotRef {
  return (
    x !== null && typeof x === "object" && "kind" in x &&
    (x as SlotRef).kind === SLOT_SYMBOL
  );
}

/** Returns the signal held by a payload entry, if it is a signal entry. */
export function entrySignal(entry: PayloadEntry | undefined): unknown {
  return entry !== undefined && "signal" in entry ? entry.signal : undefined;
}

export const CUSTOM_PARSER: CustomParser = {
  Signal: (value: unknown) => signal(value),
  Computed: (value: unknown) => computed(() => value),
  Slot: (value: { name: string; id: number }): SlotRef => ({
    kind: SLOT_SYMBOL,
    name: value.name,
    id: value.id,
  }),
  // A page level handler travels as the factory name plus the arguments it was
  // called with; calling the factory again rebuilds the closure here.
  Fn: (value: unknown) => {
    const [factory, args] = value as [string, unknown[]];
    const fn = hum_factories[factory];
    if (fn === undefined) {
      throw new Error(
        `Hum: the handler factory "${factory}" is not registered on the ` +
          `client. Declare the project factory at module scope so Hum can ` +
          `load its client implementation before hydration. Factories outside ` +
          `project discovery must be imported by browser code.`,
      );
    }
    return fn(...args);
  },
};
