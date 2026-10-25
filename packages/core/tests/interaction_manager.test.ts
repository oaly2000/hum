// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { InteractionManager } from "../src/runtime/interaction_manager.js";
import { createRootFragment } from "../src/runtime/dom.js";

describe("interaction manager", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("mounts root units before fine-grained bindings in one scheduled pass", async () => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    const component = document.createElement("section");
    const binding = document.createElement("button");
    root.append(component, binding);
    const order: string[] = [];
    const manager = new InteractionManager();

    manager.register({
      id: "binding-0",
      kind: "binding",
      owner: binding,
      phase: "binding",
      mount: () => order.push("binding"),
    });
    manager.register({
      id: "island-0",
      kind: "island",
      owner: component,
      phase: "root",
      mount: () => order.push("island"),
    });

    manager.mount();
    expect(order).toEqual([]);
    await vi.runAllTimersAsync();
    expect(order).toEqual(["island", "binding"]);
  });

  it("reports asynchronous mount failures using the postTask scheduler", () => {
    const scheduled: Array<() => void> = [];
    const previous = Object.getOwnPropertyDescriptor(globalThis, "scheduler");
    Object.defineProperty(globalThis, "scheduler", {
      configurable: true,
      value: { postTask: (callback: () => void) => scheduled.push(callback) },
    });
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    const cleanup = vi.fn();
    const manager = new InteractionManager();
    manager.register({
      id: "broken",
      kind: "island",
      owner: document.createElement("section"),
      phase: "root",
      mount: () => {
        throw new Error("mount failed");
      },
      dispose: cleanup,
    });

    try {
      expect(() => manager.mount()).not.toThrow();
      expect(scheduled).toHaveLength(1);
      expect(() => scheduled[0]()).not.toThrow();
      expect(report).toHaveBeenCalledOnce();
      expect(report.mock.calls[0][0]).toBe(
        "hum: scheduled interaction task failed.",
      );
      expect(report.mock.calls[0][1]).toBeInstanceOf(AggregateError);
      expect(cleanup).toHaveBeenCalledOnce();
    } finally {
      report.mockRestore();
      if (previous === undefined) {
        delete (globalThis as { scheduler?: unknown }).scheduler;
      } else {
        Object.defineProperty(globalThis, "scheduler", previous);
      }
    }
  });

  it("reports asynchronous update failures using the timer scheduler", async () => {
    vi.useFakeTimers();
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    const manager = new InteractionManager();
    manager.register({
      id: "partial:panel",
      kind: "partial",
      key: "panel",
      owner: document.createElement("section"),
      phase: "root",
      mount: () => {},
    });
    manager.mount();
    await vi.runAllTimersAsync();

    manager.update("partial", "panel", () => {
      throw new Error("update failed");
    });
    await vi.runAllTimersAsync();

    expect(report).toHaveBeenCalledOnce();
    expect(report.mock.calls[0][0]).toBe(
      "hum: scheduled interaction task failed.",
    );
    expect(report.mock.calls[0][1]).toBeInstanceOf(AggregateError);
    report.mockRestore();
  });

  it("rejects overlapping ownership before scheduling any mounts", () => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    const child = document.createElement("button");
    root.append(child);
    const mount = vi.fn();
    const manager = new InteractionManager();
    manager.register({
      id: "host",
      kind: "binding",
      owner: root,
      phase: "binding",
      mount,
    });
    expect(() =>
      manager.register({
        id: "nested-island",
        kind: "island",
        owner: child,
        phase: "root",
        mount,
      })
    ).toThrow(/overlapping DOM ownership/);
    manager.mount();
    vi.runAllTimers();
    expect(mount).toHaveBeenCalledOnce();
  });

  it("uses unit definitions to enforce the scheduling phase", () => {
    const manager = new InteractionManager();
    expect(() =>
      manager.register({
        id: "signal",
        kind: "binding",
        owner: document.createElement("span"),
        phase: "root",
        mount: () => {},
      })
    ).toThrow(/binding interaction units must use the "binding" phase/);
  });

  it("detects an element nested inside a marker-delimited owner range", () => {
    vi.useFakeTimers();
    const parent = document.createElement("div");
    const start = document.createTextNode("");
    const child = document.createElement("button");
    const end = document.createTextNode("");
    parent.append(start, child, end);
    const range = createRootFragment(parent, start, end);
    const manager = new InteractionManager();
    manager.register({
      id: "island-range",
      kind: "island",
      owner: range,
      phase: "root",
      mount: () => {},
    });
    expect(() =>
      manager.register({
        id: "nested-element",
        kind: "binding",
        owner: child,
        phase: "binding",
        mount: () => {},
      })
    ).toThrow(/overlapping DOM ownership/);
  });

  it("detects a marker-delimited owner nested in an element", () => {
    const parent = document.createElement("div");
    const start = document.createTextNode("");
    const child = document.createElement("button");
    const end = document.createTextNode("");
    parent.append(start, child, end);
    const range = createRootFragment(parent, start, end);
    const manager = new InteractionManager();
    manager.register({
      id: "element",
      kind: "binding",
      owner: parent,
      phase: "binding",
      mount: () => {},
    });
    expect(() =>
      manager.register({
        id: "island-range",
        kind: "island",
        owner: range,
        phase: "root",
        mount: () => {},
      })
    ).toThrow(/overlapping DOM ownership/);
  });

  it("rejects duplicate unit identities", () => {
    const manager = new InteractionManager();
    const unit = {
      id: "same",
      kind: "partial" as const,
      owner: document.createElement("div"),
      phase: "root" as const,
      mount: () => {},
    };
    manager.register(unit);

    expect(() => manager.register(unit)).toThrow(/registered more than once/);
  });

  it("disposes mounted units in reverse ownership order", async () => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    const first = document.createElement("section");
    const second = document.createElement("button");
    root.append(first, second);
    const order: string[] = [];
    const manager = new InteractionManager();
    manager.register({
      id: "first",
      kind: "island",
      owner: first,
      phase: "root",
      mount: () => order.push("mount-first"),
      dispose: () => order.push("dispose-first"),
    });
    manager.register({
      id: "second",
      kind: "binding",
      owner: second,
      phase: "binding",
      mount: () => order.push("mount-second"),
      dispose: () => order.push("dispose-second"),
    });

    manager.mount();
    await vi.runAllTimersAsync();
    manager.dispose();
    expect(order).toEqual([
      "mount-first",
      "mount-second",
      "dispose-second",
      "dispose-first",
    ]);
  });

  it("cancels scheduled mounts when disposed before the task runs", () => {
    vi.useFakeTimers();
    const mount = vi.fn();
    const manager = new InteractionManager();
    manager.register({
      id: "pending",
      kind: "partial",
      owner: document.createElement("div"),
      phase: "root",
      mount,
    });

    manager.mount();
    manager.dispose();
    vi.runAllTimers();
    expect(mount).not.toHaveBeenCalled();
  });

  it("routes a nested partial update through its owning element unit", async () => {
    vi.useFakeTimers();
    const host = document.createElement("section");
    const manager = new InteractionManager();
    const update = vi.fn();
    manager.register({
      id: "element-host",
      kind: "binding",
      owner: host,
      phase: "binding",
      delegates: ["partial:cart"],
      mount: () => {},
    });
    manager.mount();
    await vi.runAllTimersAsync();

    expect(manager.update("partial", "cart", update)).toBe(true);
    expect(update).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(update).toHaveBeenCalledOnce();
  });

  it("queues delegated updates until the owner unit is mounted", async () => {
    vi.useFakeTimers();
    const manager = new InteractionManager();
    const order: string[] = [];
    manager.register({
      id: "partial-host",
      kind: "partial",
      key: "cart",
      owner: document.createElement("section"),
      phase: "root",
      mount: () => order.push("mount"),
    });

    expect(manager.update("partial", "cart", () => order.push("update")))
      .toBe(true);
    manager.mount();
    await vi.runAllTimersAsync();
    expect(order).toEqual(["mount", "update"]);
  });

  it("reports ambiguous delegated update ownership", () => {
    const manager = new InteractionManager();
    const root = document.createElement("div");
    const first = document.createElement("section");
    const second = document.createElement("section");
    root.append(first, second);
    for (const [id, owner] of [["first", first], ["second", second]] as const) {
      manager.register({
        id,
        kind: "binding",
        owner,
        phase: "binding",
        delegates: ["partial:cart"],
        mount: () => {},
      });
    }

    expect(() => manager.update("partial", "cart", () => {}))
      .toThrow(/multiple owners/);
  });

  it("schedules a batch of partial updates together", async () => {
    vi.useFakeTimers();
    const manager = new InteractionManager();
    for (const name of ["first", "second"]) {
      manager.register({
        id: `partial:${name}`,
        kind: "partial",
        key: name,
        owner: document.createElement("section"),
        phase: "root",
        mount: () => {},
      });
    }
    manager.mount();
    await vi.runAllTimersAsync();

    const updates: string[] = [];
    expect(manager.updateMany([
      { kind: "partial", key: "first", apply: () => updates.push("first") },
      { kind: "partial", key: "second", apply: () => updates.push("second") },
    ])).toEqual([true, true]);
    expect(vi.getTimerCount()).toBe(1);
    await vi.runAllTimersAsync();
    expect(updates).toEqual(["first", "second"]);
  });

  it("waits until a batch of mounted-unit updates has been applied", async () => {
    vi.useFakeTimers();
    const manager = new InteractionManager();
    const apply = vi.fn();
    manager.register({
      id: "partial:current",
      kind: "partial",
      key: "current",
      owner: document.createElement("section"),
      phase: "root",
      mount: () => {},
    });
    manager.mount();
    await vi.runAllTimersAsync();

    let settled = false;
    const result = manager.updateManyAndWait([
      { kind: "partial", key: "current", apply },
    ]).then((applied) => {
      settled = true;
      return applied;
    });

    expect(settled).toBe(false);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual([true]);
    expect(apply).toHaveBeenCalledOnce();
    expect(settled).toBe(true);
  });

  it("replaces delegated partial targets when their owning partial updates", async () => {
    vi.useFakeTimers();
    const manager = new InteractionManager();
    manager.register({
      id: "partial:page",
      kind: "partial",
      key: "page",
      owner: document.createElement("section"),
      phase: "root",
      delegateGroups: { "partial:page": ["partial:old"] },
      mount: () => {},
    });
    manager.mount();
    await vi.runAllTimersAsync();

    manager.updateMany([{
      kind: "partial",
      key: "page",
      apply: () => {},
      delegates: ["new"],
    }]);
    await vi.runAllTimersAsync();

    expect(manager.update("partial", "old", () => {})).toBe(false);
    expect(manager.update("partial", "new", () => {})).toBe(true);
  });

  it("applies batched updates in order after their owner mounts", async () => {
    vi.useFakeTimers();
    const manager = new InteractionManager();
    manager.register({
      id: "partial:cart",
      kind: "partial",
      key: "cart",
      owner: document.createElement("section"),
      phase: "root",
      mount: () => {},
    });
    const updates: string[] = [];

    expect(manager.updateMany([
      { kind: "partial", key: "cart", apply: () => updates.push("first") },
      { kind: "partial", key: "cart", apply: () => updates.push("second") },
    ])).toEqual([true, true]);
    expect(updates).toEqual([]);

    manager.mount();
    await vi.runAllTimersAsync();
    expect(updates).toEqual(["first", "second"]);
  });

  it("waits for queued updates until their owner mounts", async () => {
    vi.useFakeTimers();
    const manager = new InteractionManager();
    const apply = vi.fn();
    manager.register({
      id: "partial:pending",
      kind: "partial",
      key: "pending",
      owner: document.createElement("section"),
      phase: "root",
      mount: () => {},
    });
    const result = manager.updateManyAndWait([
      { kind: "partial", key: "pending", apply },
    ]);

    await vi.runAllTimersAsync();
    expect(apply).not.toHaveBeenCalled();
    manager.mount();
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual([true]);
    expect(apply).toHaveBeenCalledOnce();
  });

  it("settles waiting updates when their owner is removed or the manager is disposed", async () => {
    const unregistered = new InteractionManager();
    unregistered.register({
      id: "partial:removed",
      kind: "partial",
      key: "removed",
      owner: document.createElement("section"),
      phase: "root",
      mount: () => {},
    });
    const removedUpdate = unregistered.updateManyAndWait([
      { kind: "partial", key: "removed", apply: () => {} },
    ]);
    expect(unregistered.unregister("partial:removed")).toBe(true);
    await expect(removedUpdate).resolves.toEqual([false]);

    const disposed = new InteractionManager();
    disposed.register({
      id: "partial:disposed",
      kind: "partial",
      key: "disposed",
      owner: document.createElement("section"),
      phase: "root",
      mount: () => {},
    });
    const disposedUpdate = disposed.updateManyAndWait([
      { kind: "partial", key: "disposed", apply: () => {} },
    ]);
    disposed.dispose();
    await expect(disposedUpdate).resolves.toEqual([false]);
  });

  it("rejects waiting batches when an update fails", async () => {
    vi.useFakeTimers();
    const manager = new InteractionManager();
    manager.register({
      id: "partial:broken",
      kind: "partial",
      key: "broken",
      owner: document.createElement("section"),
      phase: "root",
      mount: () => {},
    });
    manager.mount();
    await vi.runAllTimersAsync();

    const result = manager.updateManyAndWait([{
      kind: "partial",
      key: "broken",
      apply: () => {
        throw new Error("update failed");
      },
    }]);
    const rejected = expect(result).rejects.toThrow(/interaction updates failed/);
    await vi.runAllTimersAsync();

    await rejected;
  });

  it("does not queue part of a batch when another update has ambiguous ownership", async () => {
    vi.useFakeTimers();
    const manager = new InteractionManager();
    manager.register({
      id: "direct",
      kind: "partial",
      key: "direct",
      owner: document.createElement("section"),
      phase: "root",
      mount: () => {},
    });
    const host = document.createElement("div");
    const first = document.createElement("section");
    const second = document.createElement("section");
    host.append(first, second);
    for (const [id, owner] of [["host-a", first], ["host-b", second]] as const) {
      manager.register({
        id,
        kind: "binding",
        owner,
        phase: "binding",
        delegates: ["partial:ambiguous"],
        mount: () => {},
      });
    }
    const applied = vi.fn();
    expect(() =>
      manager.updateMany([
        { kind: "partial", key: "direct", apply: applied },
        { kind: "partial", key: "ambiguous", apply: () => {} },
      ])
    ).toThrow(/multiple owners/);

    manager.mount();
    await vi.runAllTimersAsync();
    expect(applied).not.toHaveBeenCalled();
  });

  it("mounts units registered after the initial interaction batch", async () => {
    vi.useFakeTimers();
    const manager = new InteractionManager();
    const first = document.createElement("section");
    const late = document.createElement("button");
    const mounted: string[] = [];
    manager.register({
      id: "first",
      kind: "island",
      owner: first,
      phase: "root",
      mount: () => mounted.push("first"),
    });
    manager.mount();
    await vi.runAllTimersAsync();
    manager.register({
      id: "late",
      kind: "binding",
      owner: late,
      phase: "binding",
      mount: () => mounted.push("late"),
    });

    expect(mounted).toEqual(["first"]);
    await vi.runAllTimersAsync();
    expect(mounted).toEqual(["first", "late"]);
  });

  it("rejects dynamically registered units with overlapping owners", async () => {
    vi.useFakeTimers();
    const manager = new InteractionManager();
    const parent = document.createElement("div");
    const child = document.createElement("button");
    parent.append(child);
    manager.register({
      id: "parent",
      kind: "binding",
      owner: parent,
      phase: "binding",
      mount: () => {},
    });
    manager.mount();
    await vi.runAllTimersAsync();

    expect(() =>
      manager.register({
        id: "child",
        kind: "island",
        owner: child,
        phase: "root",
        mount: () => {},
      })
    ).toThrow(/overlapping DOM ownership/);
  });

  it("unregisters mounted units and runs their cleanup immediately", async () => {
    vi.useFakeTimers();
    const manager = new InteractionManager();
    const disposed = vi.fn();
    manager.register({
      id: "temporary",
      kind: "partial",
      key: "temporary",
      owner: document.createElement("section"),
      phase: "root",
      mount: () => {},
      dispose: disposed,
    });
    manager.mount();
    await vi.runAllTimersAsync();

    expect(manager.unregister("temporary")).toBe(true);
    expect(manager.unregister("temporary")).toBe(false);
    expect(disposed).toHaveBeenCalledOnce();
    expect(manager.update("partial", "temporary", () => {})).toBe(false);
  });

  it("only disposes a manager after its owned DOM is detached", async () => {
    vi.useFakeTimers();
    const manager = new InteractionManager();
    const owner = document.createElement("section");
    document.body.append(owner);
    const dispose = vi.fn();
    manager.register({
      id: "connected",
      kind: "island",
      owner,
      phase: "root",
      mount: () => {},
      dispose,
    });
    manager.mount();
    await vi.runAllTimersAsync();

    expect(manager.disposeIfDetached()).toBe(false);
    expect(dispose).not.toHaveBeenCalled();
    owner.remove();
    expect(manager.disposeIfDetached()).toBe(true);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("cancels a late unit unregistered before its mount task", () => {
    vi.useFakeTimers();
    const manager = new InteractionManager();
    const mount = vi.fn();
    manager.mount();
    manager.register({
      id: "temporary",
      kind: "island",
      owner: document.createElement("div"),
      phase: "root",
      mount,
    });
    manager.unregister("temporary");
    vi.runAllTimers();
    expect(mount).not.toHaveBeenCalled();
  });
});
