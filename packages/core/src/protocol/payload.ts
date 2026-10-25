export interface SlotRef {
  kind: typeof SLOT_SYMBOL;
  name: string;
  id: number;
}

export const SLOT_SYMBOL = Symbol.for("_HUM_SLOT");

/**
 * One entry of the payload the server serialized. Island props, page level
 * signals and page level handlers share the array, which is what lets a value
 * used in several places (a signal bound as a child and as a prop) revive as a
 * single instance.
 */
export type PayloadEntry =
  | { props: Record<string, unknown>; slots?: SlotRef[] }
  | { signal: unknown }
  | { handler: unknown };

export type Payload = PayloadEntry[];

/** Module URLs and one serialized graph carried by a partial response. */
export interface PartialStateJson {
  factories?: string[];
  islands: Array<{ name: string; url: string; exportName: string }>;
  props: string;
}
