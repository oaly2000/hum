import type { HumContext } from "../types.js";

/** Both representations belong to one render and one shared payload graph. */
export interface GeneratedPage {
  route: string;
  body: string;
  partialBody: string;
  headers: [string, string][];
  generatedAt: number;
}

/** set must publish the complete value atomically. Keys include the build ID. */
export interface PageStore {
  get(key: string): GeneratedPage | undefined | Promise<GeneratedPage | undefined>;
  set(key: string, page: GeneratedPage): void | Promise<void>;
}

export interface PageServiceOptions {
  store?: PageStore;
  /** e.g. (task, c) => c.executionCtx.waitUntil(task). Without it updates block. */
  background?: (task: Promise<void>, context: HumContext) => void;
  /** Clock for expiry; defaults to Date.now. */
  now?: () => number;
}
