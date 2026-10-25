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
  unit: InteractionUnitInstance;
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
  private readonly units: InteractionUnitInstance[] = [];
  private readonly mounted: Array<{
    unit: InteractionUnitInstance;
    cleanup?: () => void;
  }> = [];
  private readonly pendingUpdates: PendingInteractionUpdate[] = [];
  private readonly scheduled = new Set<InteractionUnitInstance>();
  private started = false;
  private disposed = false;
  private mountTaskScheduled = false;

  register(registration: InteractionUnitRegistration): void {
    if (this.disposed) {
      throw new Error("hum: cannot register an interaction unit after disposal.");
    }
    if (this.units.some((registered) => registered.id === registration.id)) {
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
    this.assertExclusiveOwnership([...this.units, unit]);
    this.units.push(unit);
    if (this.started) this.scheduleMount([unit]);
  }

  unregister(id: string): boolean {
    const index = this.units.findIndex((unit) => unit.id === id);
    if (index === -1) return false;
    const [unit] = this.units.splice(index, 1);
    this.scheduled.delete(unit);
    for (let i = this.pendingUpdates.length - 1; i >= 0; i--) {
      if (this.pendingUpdates[i].unit === unit) {
        this.pendingUpdates[i].settle?.(false);
        this.pendingUpdates.splice(i, 1);
      }
    }

    const mountedIndex = this.mounted.findIndex((entry) => entry.unit === unit);
    if (mountedIndex !== -1) {
      const [mounted] = this.mounted.splice(mountedIndex, 1);
      const errors = this.disposeMounted(mounted);
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
    if (this.units.some((unit) => isConnected(unit.owner))) return false;
    this.dispose();
    return true;
  }

  mount(): void {
    if (this.started) {
      throw new Error("hum: the interaction manager was mounted more than once.");
    }

    this.assertExclusiveOwnership();
    this.started = true;
    this.scheduleMount(this.units);
  }

  private scheduleMount(units: InteractionUnitInstance[]): void {
    const scheduledUnits = units.filter((unit) =>
      !this.disposed &&
      this.units.includes(unit) &&
      !this.scheduled.has(unit) &&
      !this.mounted.some((entry) => entry.unit === unit)
    );
    for (const unit of scheduledUnits) this.scheduled.add(unit);
    if (scheduledUnits.length === 0 || this.mountTaskScheduled) return;

    this.mountTaskScheduled = true;
    scheduleInteractionMount(() => {
      this.mountTaskScheduled = false;
      if (this.disposed) return;
      const ordered = [...this.scheduled].sort((a, b) =>
        a.definition.phase === b.definition.phase
          ? 0
          : a.definition.phase === "root"
          ? -1
          : 1
      );
      this.scheduled.clear();
      const errors: Error[] = [];
      for (const unit of ordered) {
        if (!this.units.includes(unit)) continue;
        if (this.disposed) break;
        const mounted = { unit } as {
          unit: InteractionUnitInstance;
          cleanup?: () => void;
        };
        this.mounted.push(mounted);
        try {
          const cleanup = unit.mount();
          if (typeof cleanup === "function") mounted.cleanup = cleanup;
        } catch (error) {
          errors.push(
            new Error(
              `hum: failed to mount ${unit.definition.kind} interaction unit "${unit.id}".`,
              { cause: error },
            ),
          );
        }
      }
      if (errors.length === 0) {
        errors.push(...this.applyUpdates(this.pendingUpdates.splice(0)));
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
    const resolved = this.resolveUpdates(updates);
    this.scheduleUpdates(resolved);
    return resolved.map(({ unit }) => unit !== undefined);
  }

  updateManyAndWait(updates: InteractionUpdate[]): Promise<boolean[]> {
    const resolved = this.resolveUpdates(updates);
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

      this.scheduleUpdates(resolved.map((entry, index) => ({
        ...entry,
        settle: (applied: boolean, error?: Error) => settle(index, applied, error),
      })), true);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of this.pendingUpdates.splice(0)) {
      pending.settle?.(false);
    }
    this.scheduled.clear();
    const errors: Error[] = [];
    for (const { unit, cleanup } of this.mounted.splice(0).reverse()) {
      errors.push(...this.disposeMounted({ unit, cleanup }));
    }
    this.units.length = 0;
    if (errors.length > 0) {
      throw new AggregateError(errors, "hum: interaction unit disposal failed.");
    }
  }

  private disposeMounted(
    mounted: { unit: InteractionUnitInstance; cleanup?: () => void },
  ): Error[] {
    const { unit, cleanup } = mounted;
    const errors: Error[] = [];
    try {
      cleanup?.();
    } catch (error) {
      errors.push(
        new Error(
          `hum: failed to run the cleanup for ${unit.definition.kind} unit "${unit.id}".`,
          { cause: error },
        ),
      );
    }
    try {
      unit.dispose?.();
    } catch (error) {
      errors.push(
        new Error(
          `hum: failed to dispose ${unit.definition.kind} interaction unit "${unit.id}".`,
          { cause: error },
        ),
      );
    }
    return errors;
  }

  private resolveUpdates(updates: InteractionUpdate[]) {
    return updates.map((update) => ({
      update,
      unit: this.disposed ? undefined : this.ownerOf(update.kind, update.key),
    }));
  }

  private scheduleUpdates(
    updates: Array<Omit<PendingInteractionUpdate, "unit"> & {
      unit: InteractionUnitInstance | undefined;
    }>,
    waiting = false,
  ): void {
    const scheduled: PendingInteractionUpdate[] = [];
    for (const { unit, update, settle } of updates) {
      if (unit === undefined) continue;
      const queue = this.mounted.some((entry) => entry.unit === unit)
        ? scheduled
        : this.pendingUpdates;
      queue.push({ unit, update, settle });
    }
    if (scheduled.length === 0) return;
    scheduleInteractionMount(() => {
      const errors = this.applyUpdates(scheduled);
      if (!waiting && errors.length > 0) {
        throw new AggregateError(errors, "hum: interaction updates failed.");
      }
    });
  }

  private applyUpdates(pending: PendingInteractionUpdate[]): Error[] {
    const errors: Error[] = [];
    for (const { unit, update, settle } of pending) {
      if (this.disposed || !this.mounted.some((entry) => entry.unit === unit)) {
        settle?.(false);
        continue;
      }
      try {
        this.applyUpdate(unit, update);
        settle?.(true);
      } catch (error) {
        const failure = new Error(
          `hum: failed to apply an update to ${unit.definition.kind} unit "${unit.id}".`,
          { cause: error },
        );
        errors.push(failure);
        settle?.(false, failure);
      }
    }
    return errors;
  }

  private applyUpdate(
    unit: InteractionUnitInstance,
    update: InteractionUpdate,
  ): void {
    update.apply();
    if (update.delegates !== undefined) {
      unit.delegateGroups ??= {};
      unit.delegateGroups[`${update.kind}:${update.key}`] = update.delegates.map(
        (key) => `${update.kind}:${key}`,
      );
    }
  }

  private ownerOf(
    kind: InteractionUnitKind,
    key: string,
  ): InteractionUnitInstance | undefined {
    const direct = this.units.filter((candidate) =>
      candidate.definition.kind === kind && candidate.key === key
    );
    const delegated = direct.length === 0
      ? this.units.filter((candidate) =>
        candidate.delegates?.includes(`${kind}:${key}`) === true ||
        Object.values(candidate.delegateGroups ?? {}).some((keys) =>
          keys.includes(`${kind}:${key}`)
        )
      )
      : direct;
    if (delegated.length > 1) {
      throw new Error(
        `hum: interaction update "${kind}:${key}" has multiple owners.`,
      );
    }
    return delegated[0];
  }

  private assertExclusiveOwnership(units = this.units): void {
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i];
        const b = units[j];
        if (boundariesOverlap(a.owner, b.owner)) {
          throw new Error(
            `hum: interaction units "${a.id}" (${a.definition.kind}) and ` +
              `"${b.id}" (${b.definition.kind}) have overlapping DOM ownership.`,
          );
        }
      }
    }
  }
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

function boundariesOverlap(a: Node, b: Node): boolean {
  return containsNode(a, b) || containsNode(b, a);
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
