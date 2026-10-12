import {
  HOLE,
  INFINITY_NEG,
  INFINITY_POS,
  NAN,
  NULL,
  UNDEFINED,
} from "./constants.js";

/**
 * Counterpart of {@link stringify}'s `custom` stringifiers: `Signal` values are
 * turned back into reactive signals, `Slot` values into slot references.
 */
export type CustomParser = Record<
  string,
  (value: any) => unknown
>;

/** Revives data produced by {@link stringify}. */
export function parse<T = unknown>(
  value: string,
  custom?: CustomParser | undefined,
): T {
  const data: any = JSON.parse(value);
  if (!Array.isArray(data)) return unpack([], [], data, custom) as T;
  const hydrated = new Array(data.length);
  unpack(data, hydrated, 0, custom);
  return hydrated[0] as T;
}

function unpack(
  arr: unknown[],
  hydrated: unknown[],
  idx: number,
  custom: CustomParser | undefined,
): unknown {
  switch (idx) {
    case UNDEFINED:
      return undefined;
    case NULL:
      return null;
    case NAN:
      return NaN;
    case INFINITY_POS:
      return Infinity;
    case INFINITY_NEG:
      return -Infinity;
    case -6:
      return -0;
    case HOLE:
      return undefined;
  }

  if (idx in hydrated) return hydrated[idx];

  const current = arr[idx] as unknown;
  if (typeof current === "number") {
    return (hydrated[idx] = current);
  } else if (
    typeof current === "string" || typeof current === "boolean" ||
    current === null
  ) {
    return (hydrated[idx] = current);
  } else if (Array.isArray(current)) {
    if (current.length > 0 && typeof current[0] === "string") {
      const name = current[0] as string;
      if (custom !== undefined && name in custom) {
        const fn = custom[name];
        const value = unpack(arr, hydrated, current[1] as number, custom);
        return (hydrated[idx] = fn(value));
      }
      switch (name) {
        case "BigInt":
          return (hydrated[idx] = BigInt(current[1] as string));
        case "URL":
          return (hydrated[idx] = new URL(current[1] as string));
        case "Date":
          return (hydrated[idx] = new Date(current[1] as string));
        case "RegExp":
          return (hydrated[idx] = new RegExp(
            current[1] as string,
            current[2] as string,
          ));
        case "Set": {
          const set = new Set<unknown>();
          const refs = current[1] as number[];
          for (let i = 0; i < refs.length; i++) {
            set.add(unpack(arr, hydrated, refs[i], custom));
          }
          return (hydrated[idx] = set);
        }
        case "Map": {
          const map = new Map<unknown, unknown>();
          const refs = current[1] as number[];
          for (let i = 0; i < refs.length; i++) {
            const key = unpack(arr, hydrated, refs[i++], custom);
            const item = unpack(arr, hydrated, refs[i], custom);
            map.set(key, item);
          }
          return (hydrated[idx] = map);
        }
        case "Uint8Array":
          return (hydrated[idx] = b64decode(current[1] as string));
      }
    }

    const actual = new Array(current.length);
    hydrated[idx] = actual;
    for (let i = 0; i < current.length; i++) {
      const ref = current[i] as number;
      if (ref === HOLE) continue;
      actual[i] = unpack(arr, hydrated, ref, custom);
    }
    return actual;
  } else if (typeof current === "object") {
    const actual: Record<string, unknown> = {};
    hydrated[idx] = actual;
    const keys = Object.keys(current);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      actual[key] = unpack(arr, hydrated, (current as any)[key], custom);
    }
    return actual;
  }

  return undefined;
}

function b64decode(b64: string): Uint8Array {
  const globalAtob =
    (globalThis as any).atob as ((input: string) => string) | undefined;
  const binString = globalAtob
    ? globalAtob(b64)
    : Buffer.from(b64, "base64").toString("binary");
  const size = binString.length;
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = binString.charCodeAt(i);
  return bytes;
}
