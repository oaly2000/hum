import {
  HOLE,
  INFINITY_NEG,
  INFINITY_POS,
  NAN,
  NULL,
  UNDEFINED,
  ZERO_NEG,
} from "./constants.js";

/**
 * A custom stringifier is invoked for every non-primitive value that is about
 * to be serialized. Returning `{ value }` takes over serialization: the value
 * is encoded as `["<tagName>", <slotIndex>]` and revived on the client by the
 * matching parser registered in {@link CustomParser}.
 */
export type Stringifiers = Record<
  string,
  (value: any) => { value: any } | undefined
>;

/**
 * Serializes data into a compact, reference-sharing format that can be parsed
 * by {@link parse}. Values are collected into a flat slot array; composites
 * only store indexes into that array, which makes circular references and
 * shared references cheap and exact.
 *
 * Supported: `undefined`, `null`, `boolean`, `number` (incl. `NaN`, `±Infinity`
 * and `-0`), `bigint`, `string`, `Array`, plain `Object`, `Uint8Array`, `URL`,
 * `Date`, `RegExp`, `Set`, `Map` plus any custom tag handled by `custom`.
 * Functions cannot be serialized and throw.
 */
export function stringify(data: unknown, custom?: Stringifiers): string {
  const out: string[] = [];
  const indexes = new Map<unknown, number>();
  const res = serializeInner(out, indexes, data, custom);
  if (res < 0) return String(res);
  return `[${out.join(",")}]`;
}

function serializeInner(
  out: string[],
  indexes: Map<unknown, number>,
  value: unknown,
  custom: Stringifiers | undefined,
): number {
  const seenIdx = indexes.get(value);
  if (seenIdx !== undefined) return seenIdx;

  if (value === undefined) return UNDEFINED;
  if (value === null) return NULL;
  if (Number.isNaN(value)) return NAN;
  if (value === Infinity) return INFINITY_POS;
  if (value === -Infinity) return INFINITY_NEG;
  if (value === 0 && 1 / (value as number) < 0) return ZERO_NEG;

  const idx = out.length;
  out.push("");
  indexes.set(value, idx);

  let str = "";

  if (typeof value === "number") {
    str += String(value);
  } else if (typeof value === "boolean") {
    str += String(value);
  } else if (typeof value === "bigint") {
    str += `["BigInt","${value}"]`;
  } else if (typeof value === "string") {
    str += JSON.stringify(value);
  } else if (Array.isArray(value)) {
    str += "[";
    for (let i = 0; i < value.length; i++) {
      str += i in value
        ? serializeInner(out, indexes, value[i], custom)
        : String(HOLE);
      if (i < value.length - 1) str += ",";
    }
    str += "]";
  } else if (typeof value === "object" || typeof value === "function") {
    if (custom !== undefined) {
      for (const k in custom) {
        const fn = custom[k];
        if (fn === undefined) continue;
        const res = fn(value);
        if (res === undefined) continue;
        const innerIdx = serializeInner(out, indexes, res.value, custom);
        str = `["${k}",${innerIdx}]`;
        out[idx] = str;
        return idx;
      }
    }

    if (typeof value === "function") {
      throw new Error(
        "Hum: serializing functions is not supported. Island props and page " +
          "level event handlers must be serializable data (or a signal / a " +
          "factory from `@humjs/core/events`).",
      );
    }

    if (value instanceof URL) {
      str += `["URL","${value.href}"]`;
    } else if (value instanceof Date) {
      let iso: string;
      try {
        iso = value.toISOString();
      } catch {
        iso = "Invalid Date";
      }
      str += `["Date","${iso}"]`;
    } else if (value instanceof RegExp) {
      str += `["RegExp",${JSON.stringify(value.source)}, "${value.flags}"]`;
    } else if (value instanceof Uint8Array) {
      str += `["Uint8Array","${b64encode(value)}"]`;
    } else if (value instanceof Set) {
      const items = new Array<string>(value.size);
      let i = 0;
      value.forEach((v) => {
        items[i++] = String(serializeInner(out, indexes, v, custom));
      });
      str += `["Set",[${items.join(",")}]]`;
    } else if (value instanceof Map) {
      const items = new Array<string>(value.size * 2);
      let i = 0;
      value.forEach((v, k) => {
        items[i++] = String(serializeInner(out, indexes, k, custom));
        items[i++] = String(serializeInner(out, indexes, v, custom));
      });
      str += `["Map",[${items.join(",")}]]`;
    } else {
      str += "{";
      const keys = Object.keys(value);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        str += JSON.stringify(key) + ":";
        str += serializeInner(out, indexes, (value as any)[key], custom);
        if (i < keys.length - 1) str += ",";
      }
      str += "}";
    }
  }

  out[idx] = str;
  return idx;
}

// deno-fmt-ignore
const base64abc = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O",
  "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "a", "b", "c", "d",
  "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s",
  "t", "u", "v", "w", "x", "y", "z", "0", "1", "2", "3", "4", "5", "6", "7",
  "8", "9", "+", "/",
];

/** Encodes bytes as RFC4648 base64. */
function b64encode(uint8: Uint8Array): string {
  let result = "";
  let i: number;
  const l = uint8.length;
  for (i = 2; i < l; i += 3) {
    result += base64abc[uint8[i - 2] >> 2];
    result += base64abc[((uint8[i - 2] & 0x03) << 4) | (uint8[i - 1] >> 4)];
    result += base64abc[((uint8[i - 1] & 0x0f) << 2) | (uint8[i] >> 6)];
    result += base64abc[uint8[i] & 0x3f];
  }
  if (i === l + 1) {
    result += base64abc[uint8[i - 2] >> 2];
    result += base64abc[(uint8[i - 2] & 0x03) << 4];
    result += "==";
  }
  if (i === l) {
    result += base64abc[uint8[i - 2] >> 2];
    result += base64abc[((uint8[i - 2] & 0x03) << 4) | (uint8[i - 1] >> 4)];
    result += base64abc[(uint8[i - 1] & 0x0f) << 2];
    result += "=";
  }
  return result;
}
