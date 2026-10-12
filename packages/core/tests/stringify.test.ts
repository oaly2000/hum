import { describe, expect, it } from "vitest";

import { parse } from "../src/jsonify/parse.js";
import { stringify } from "../src/jsonify/stringify.js";

describe("stringify/parse", () => {
  function roundTrip(value: unknown): unknown {
    return parse(stringify(value));
  }

  it("round trips primitives", () => {
    expect(roundTrip(1)).toBe(1);
    expect(roundTrip("a")).toBe("a");
    expect(roundTrip(true)).toBe(true);
    expect(roundTrip(null)).toBeNull();
    expect(roundTrip(undefined)).toBeUndefined();
    expect(Number.isNaN(roundTrip(NaN) as number)).toBe(true);
    expect(roundTrip(Infinity)).toBe(Infinity);
    expect(roundTrip(-Infinity)).toBe(-Infinity);
  });

  it("round trips objects, arrays and nested values", () => {
    const value = { a: [1, 2, { b: "c" }], d: { e: [true, false, null] } };
    expect(roundTrip(value)).toEqual(value);
  });

  it("preserves shared references", () => {
    const shared = { n: 1 };
    const result = roundTrip({ a: shared, b: shared }) as {
      a: unknown;
      b: unknown;
    };
    expect(result.a).toBe(result.b);
  });

  it("preserves circular references", () => {
    const value: Record<string, unknown> = { name: "root" };
    value.self = value;
    const result = roundTrip(value) as Record<string, unknown>;
    expect(result.self).toBe(result);
  });

  it("supports built-in types", () => {
    expect(roundTrip(new Date("2024-01-02T03:04:05.000Z"))).toEqual(
      new Date("2024-01-02T03:04:05.000Z"),
    );
    expect(roundTrip(new URL("https://hum.dev/a?b=1"))).toEqual(
      new URL("https://hum.dev/a?b=1"),
    );
    expect(roundTrip(/ab+c/gi)).toEqual(/ab+c/gi);
    expect(roundTrip(10n)).toBe(10n);
    expect(roundTrip(new Set([1, 2]))).toEqual(new Set([1, 2]));
    expect(roundTrip(new Map([["a", 1]]))).toEqual(new Map([["a", 1]]));
    expect(Array.from(roundTrip(new Uint8Array([1, 2, 3])) as Uint8Array))
      .toEqual([1, 2, 3]);
  });

  it("uses custom stringifiers and parsers", () => {
    const stringifiers = {
      Signal: (value: unknown) =>
        value !== null && typeof value === "object" && "current" in value
          ? { value: (value as { current: number }).current }
          : undefined,
    };
    const parsers = {
      Signal: (value: unknown) => ({ current: value as number }),
    };

    const encoded = stringify({ count: { current: 3 } }, stringifiers);
    expect(encoded).toContain("Signal");
    expect(parse(encoded, parsers)).toEqual({ count: { current: 3 } });
  });

  it("throws for functions", () => {
    expect(() => stringify({ fn: () => 1 })).toThrow(/functions/i);
  });
});
