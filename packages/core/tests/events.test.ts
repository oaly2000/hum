import { signal, type Signal } from "@preact/signals";
import { describe, expect, it } from "vitest";

import {
  add,
  coerceToSignalType,
  defineFactory,
  factoryMarkerOf,
  hum_factories,
  setFromProp,
  setValue,
  toggle,
} from "../src/runtime/events.js";
import { testFactory } from "./helpers/factory.js";

describe("handler factories", () => {
  it("stamps the factory name and its arguments on the result", () => {
    const count = signal(1);
    const open = signal(false);
    expect(factoryMarkerOf(add(count, 2))).toEqual({
      factory: "add",
      args: [count, 2],
    });
    expect(factoryMarkerOf(setValue(count, 7))).toEqual({
      factory: "setValue",
      args: [count, 7],
    });
    expect(factoryMarkerOf(toggle(open))).toEqual({
      factory: "toggle",
      args: [open],
    });
  });

  it("does not mark plain closures", () => {
    expect(factoryMarkerOf(() => {})).toBeUndefined();
    expect(factoryMarkerOf({})).toBeUndefined();
    expect(factoryMarkerOf(null)).toBeUndefined();
  });

  it("registers itself for the client runtime", () => {
    expect(hum_factories.add).toBe(add);
    expect(hum_factories.setFromProp).toBe(setFromProp);
  });

  it("lets an app define a factory of its own", () => {
    const selectRow = testFactory(
      "selectRow",
      (selected: Signal<string | null>, id: string) => () => {
        selected.value = id;
      },
    );

    const selected = signal<string | null>(null);
    const handler = selectRow(selected, "row-3");

    expect(factoryMarkerOf(handler)).toEqual({
      factory: "selectRow",
      args: [selected, "row-3"],
    });
    expect(hum_factories.selectRow).toBe(selectRow);

    handler(new Event("click"));
    expect(selected.value).toBe("row-3");
  });

  it("adds with optional bounds", () => {
    const count = signal(9);
    add(count, 5, { max: 10 })(new Event("click"));
    expect(count.value).toBe(10);
    add(count, -20, { min: 0 })(new Event("click"));
    expect(count.value).toBe(0);
  });

  it("sets a value or toggles a boolean", () => {
    const value = signal("a");
    setValue(value, "b")(new Event("click"));
    expect(value.value).toBe("b");

    const open = signal(false);
    toggle(open)(new Event("click"));
    expect(open.value).toBe(true);
  });

  it("copies a property off the event target", () => {
    const value = signal("");
    setFromProp(value, "value")({
      currentTarget: { value: "typed" },
    } as unknown as Event);
    expect(value.value).toBe("typed");
  });
});

describe("coerceToSignalType", () => {
  it("parses numbers for numeric signals", () => {
    expect(coerceToSignalType("42", 0)).toBe(42);
    expect(coerceToSignalType("", 0)).toBe(0);
    expect(coerceToSignalType(3, 0)).toBe(3);
  });

  it("keeps unparseable input so typing is not clobbered", () => {
    expect(coerceToSignalType("1e", 0)).toBe("1e");
  });

  it("passes other values through", () => {
    expect(coerceToSignalType("a", "")).toBe("a");
    expect(coerceToSignalType(true, false)).toBe(true);
    expect(coerceToSignalType(null, "a")).toBeNull();
  });
});

it("requires compiler identity for application factories", () => {
  expect(() => defineFactory(() => () => {})).toThrow(/Hum Vite plugin/);
});
