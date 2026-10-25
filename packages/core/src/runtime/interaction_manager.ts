export type InteractionUnitKind =
  | "island"
  | "partial"
  | "binding";

export interface InteractionUnitDefinition {
  readonly kind: InteractionUnitKind;
  readonly phase: "root" | "binding";
}

export const INTERACTION_UNIT_DEFINITIONS: Readonly<
  Record<InteractionUnitKind, InteractionUnitDefinition>
> = {
  island: { kind: "island", phase: "root" },
  partial: { kind: "partial", phase: "root" },
  binding: { kind: "binding", phase: "binding" },
};

export interface InteractionUnitRegistration {
  id: string;
  kind: InteractionUnitKind;
  key?: string;
  delegates?: string[];
  delegateGroups?: Record<string, string[]>;
  owner: Node;
  phase: "root" | "binding";
  mount(): void | (() => void);
  dispose?(): void;
}

export interface InteractionUnitInstance {
  id: string;
  definition: InteractionUnitDefinition;
  key?: string;
  delegates?: string[];
  delegateGroups?: Record<string, string[]>;
  owner: Node;
  mount(): void | (() => void);
  dispose?(): void;
}

export interface InteractionUpdate {
  kind: InteractionUnitKind;
  key: string;
  apply(): void;
  delegates?: string[];
}

interface PendingInteractionUpdate {
  unit: InteractionUnitInstance | undefined;
  update: InteractionUpdate;
  settle?: (applied: boolean, error?: Error) => void;
}

interface RootFragment extends Node {
  _humRootFrag?: true;
  _humStartMarker?: Node;
  _humEndMarker?: Node;
}

/**
 * Coordinates the existing client interaction roots. The unit kinds still
 * have different renderers, but registration, ownership checks, ordering and
 * scheduling are shared.
 */
export class InteractionManager {
  #units = new Map<string, InteractionUnitInstance>();
  #mounted = new Map<InteractionUnitInstance, (() => void) | void>();
  #owners = new Map<string, Set<InteractionUnitInstance>>();
  #pendingUpdates: PendingInteractionUpdate[] = [];
  #scheduled = new Set<InteractionUnitInstance>();
  #started = false;
  #disposed = false;
  #mountTaskScheduled = false;

  register(registration: InteractionUnitRegistration): void {
    if (this.#disposed) {
      throw new Error("hum: cannot register an interaction unit after disposal.");
    }
    if (this.#units.has(registration.id)) {
      throw new Error(
        `hum: interaction unit "${registration.id}" was registered more than once.`,
      );
    }
    const definition = INTERACTION_UNIT_DEFINITIONS[registration.kind];
    if (registration.phase !== definition.phase) {
      throw new Error(
        `hum: ${registration.kind} interaction units must use the ` +
          `"${definition.phase}" phase.`,
      );
    }
    const { kind: _kind, phase: _phase, ...instance } = registration;
    const unit: InteractionUnitInstance = { ...instance, definition };
    this.#assertExclusiveOwnership(unit);
    this.#units.set(unit.id, unit);
    if (unit.key !== undefined) {
      const target = `${unit.definition.kind}:${unit.key}`;
      let owners = this.#owners.get(target);
      if (owners === undefined) this.#owners.set(target, owners = new Set());
      owners.add(unit);
    }
    if (this.#started) this.#scheduleMount([unit]);
  }

  unregister(id: string): boolean {
    const unit = this.#units.get(id);
    if (unit === undefined) return false;
    this.#units.delete(id);
    if (unit.key !== undefined) {
      const target = `${unit.definition.kind}:${unit.key}`;
      const owners = this.#owners.get(target)!;
      owners.delete(unit);
      if (owners.size === 0) this.#owners.delete(target);
    }
    this.#scheduled.delete(unit);
    for (let i = this.#pendingUpdates.length - 1; i >= 0; i--) {
      if (this.#pendingUpdates[i].unit === unit) {
        this.#pendingUpdates[i].settle?.(false);
        this.#pendingUpdates.splice(i, 1);
      }
    }

    if (this.#mounted.has(unit)) {
      const errors = this.#disposeMounted(unit);
      if (errors.length > 0) {
        throw new AggregateError(
          errors,
          `hum: failed to unregister interaction unit "${id}".`,
        );
      }
    }
    return true;
  }

  disposeIfDetached(): boolean {
    for (const unit of this.#units.values()) {
      if (isConnected(unit.owner)) return false;
    }
    this.dispose();
    return true;
  }

  mount(): void {
    if (this.#started) {
      throw new Error("hum: the interaction manager was mounted more than once.");
    }

    const checked: InteractionUnitInstance[] = [];
    for (const unit of this.#units.values()) {
      this.#assertExclusiveOwnership(unit, checked);
      checked.push(unit);
    }
    this.#started = true;
    this.#scheduleMount(this.#units.values());
  }

  #scheduleMount(units: Iterable<InteractionUnitInstance>): void {
    if (this.#disposed) return;
    for (const unit of units) {
      if (!this.#mounted.has(unit)) this.#scheduled.add(unit);
    }
    if (this.#scheduled.size === 0 || this.#mountTaskScheduled) return;

    this.#mountTaskScheduled = true;
    scheduleInteractionMount(() => {
      this.#mountTaskScheduled = false;
      if (this.#disposed) return;
      const ordered = [...this.#scheduled].sort((a, b) =>
        a.definition.phase === b.definition.phase
          ? 0
          : a.definition.phase === "root"
          ? -1
          : 1
      );
      this.#scheduled.clear();
      const errors: Error[] = [];
      for (const unit of ordered) {
        if (this.#units.get(unit.id) !== unit) continue;
        if (this.#disposed) break;
        this.#mounted.set(unit, undefined);
        try {
          const cleanup = unit.mount();
          if (typeof cleanup === "function") {
            if (this.#mounted.has(unit)) this.#mounted.set(unit, cleanup);
            else cleanup();
          }
        } catch (error) {
          errors.push(
            unitError(unit, "mount", error),
          );
        }
      }
      if (errors.length === 0) {
        errors.push(...this.#applyUpdates(this.#pendingUpdates.splice(0)));
      }
      if (errors.length > 0) {
        try {
          this.dispose();
        } catch (disposeError) {
          errors.push(
            new Error("hum: interaction unit rollback failed.", {
              cause: disposeError,
            }),
          );
        }
        throw new AggregateError(errors, "hum: interaction unit mounting failed.");
      }
    });
  }

  update(
    kind: InteractionUnitKind,
    key: string,
    update: () => void,
  ): boolean {
    return this.updateMany([{ kind, key, apply: update }])[0];
  }

  updateMany(updates: InteractionUpdate[]): boolean[] {
    const resolved = this.#resolveUpdates(updates);
    this.#scheduleUpdates(resolved);
    return resolved.map(({ unit }) => unit !== undefined);
  }

  updateManyAndWait(updates: InteractionUpdate[]): Promise<boolean[]> {
    const resolved = this.#resolveUpdates(updates);
    const result = resolved.map(({ unit }) => unit !== undefined);
    let remaining = result.filter(Boolean).length;
    if (remaining === 0) return Promise.resolve(result);

    return new Promise((resolve, reject) => {
      const errors: Error[] = [];
      const settle = (index: number, applied: boolean, error?: Error) => {
        result[index] = applied;
        if (error !== undefined) errors.push(error);
        remaining--;
        if (remaining !== 0) return;
        if (errors.length > 0) {
          reject(new AggregateError(errors, "hum: interaction updates failed."));
        } else {
          resolve(result);
        }
      };

      this.#scheduleUpdates(resolved, settle);
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const pending of this.#pendingUpdates.splice(0)) {
      pending.settle?.(false);
    }
    this.#scheduled.clear();
    const errors: Error[] = [];
    for (const unit of [...this.#mounted.keys()].reverse()) {
      if (this.#mounted.has(unit)) errors.push(...this.#disposeMounted(unit));
    }
    this.#units.clear();
    this.#owners.clear();
    if (errors.length > 0) {
      throw new AggregateError(errors, "hum: interaction unit disposal failed.");
    }
  }

  #disposeMounted(
    unit: InteractionUnitInstance,
  ): Error[] {
    const cleanup = this.#mounted.get(unit);
    this.#mounted.delete(unit);
    const errors: Error[] = [];
    try {
      cleanup?.();
    } catch (error) {
      errors.push(
        unitError(unit, "run the cleanup for", error),
      );
    }
    try {
      unit.dispose?.();
    } catch (error) {
      errors.push(
        unitError(unit, "dispose", error),
      );
    }
    return errors;
  }

  #resolveUpdates(updates: InteractionUpdate[]): PendingInteractionUpdate[] {
    return updates.map((update) => ({
      update,
      unit: this.#disposed ? undefined : this.#ownerOf(update.kind, update.key),
    }));
  }

  #scheduleUpdates(
    updates: PendingInteractionUpdate[],
    settle?: (index: number, applied: boolean, error?: Error) => void,
  ): void {
    const scheduled: PendingInteractionUpdate[] = [];
    for (let i = 0; i < updates.length; i++) {
      const entry = updates[i];
      if (entry.unit === undefined) continue;
      if (settle !== undefined) {
        entry.settle = (applied, error) => settle(i, applied, error);
      }
      const queue = this.#mounted.has(entry.unit) ? scheduled : this.#pendingUpdates;
      queue.push(entry);
    }
    if (scheduled.length === 0) return;
    scheduleInteractionMount(() => {
      const errors = this.#applyUpdates(scheduled);
      if (settle === undefined && errors.length > 0) {
        throw new AggregateError(errors, "hum: interaction updates failed.");
      }
    });
  }

  #applyUpdates(pending: PendingInteractionUpdate[]): Error[] {
    const errors: Error[] = [];
    for (const { unit, update, settle } of pending) {
      if (unit === undefined || this.#disposed || !this.#mounted.has(unit)) {
        settle?.(false);
        continue;
      }
      try {
        update.apply();
        if (update.delegates !== undefined) {
          unit.delegateGroups ??= {};
          unit.delegateGroups[`${update.kind}:${update.key}`] = update.delegates.map(
            (key) => `${update.kind}:${key}`,
          );
        }
        settle?.(true);
      } catch (error) {
        const failure = unitError(unit, "apply an update to", error);
        errors.push(failure);
        settle?.(false, failure);
      }
    }
    return errors;
  }

  #ownerOf(
    kind: InteractionUnitKind,
    key: string,
  ): InteractionUnitInstance | undefined {
    const target = `${kind}:${key}`;
    // Direct owners take precedence, even if multiple hosts delegate the key.
    const direct = this.#owners.get(target);
    let owner: InteractionUnitInstance | undefined;
    for (const candidate of direct ?? this.#units.values()) {
      if (
        direct === undefined && !candidate.delegates?.includes(target) &&
        !Object.values(candidate.delegateGroups ?? {}).some((keys) => keys.includes(target))
      ) {
        continue;
      }
      if (owner !== undefined) {
        throw new Error(`hum: interaction update "${target}" has multiple owners.`);
      }
      owner = candidate;
    }
    return owner;
  }

  #assertExclusiveOwnership(
    unit: InteractionUnitInstance,
    others: Iterable<InteractionUnitInstance> = this.#units.values(),
  ): void {
    for (const other of others) {
      if (containsNode(other.owner, unit.owner) || containsNode(unit.owner, other.owner)) {
        throw new Error(
          `hum: interaction units "${other.id}" (${other.definition.kind}) and ` +
            `"${unit.id}" (${unit.definition.kind}) have overlapping DOM ownership.`,
        );
      }
    }
  }
}

function unitError(
  unit: InteractionUnitInstance,
  action: string,
  cause: unknown,
): Error {
  return new Error(
    `hum: failed to ${action} ${unit.definition.kind} unit "${unit.id}".`,
    { cause },
  );
}

function rangeMarkers(node: Node): [Node, Node] | undefined {
  const range = node as RootFragment;
  if (
    range._humRootFrag === true && range._humStartMarker !== undefined &&
    range._humEndMarker !== undefined
  ) {
    return [range._humStartMarker, range._humEndMarker];
  }
  return undefined;
}

function isConnected(node: Node): boolean {
  const markers = rangeMarkers(node);
  return markers === undefined
    ? node.isConnected
    : markers[0].isConnected || markers[1].isConnected;
}

function containsNode(owner: Node, candidate: Node): boolean {
  if (owner === candidate) return true;
  const markers = rangeMarkers(candidate);
  if (markers !== undefined) {
    return owner.contains(markers[0]) || owner.contains(markers[1]);
  }
  return owner.contains(candidate);
}

export function scheduleInteractionMount(callback: () => void): void {
  const scheduler = (globalThis as {
    scheduler?: { postTask?: (cb: () => void) => void };
  }).scheduler;
  const reportFailure = () => {
    try {
      callback();
    } catch (error) {
      console.error("hum: scheduled interaction task failed.", error);
    }
  };
  if (typeof scheduler?.postTask === "function") {
    scheduler.postTask(reportFailure);
  } else {
    setTimeout(reportFailure, 0);
  }
}
