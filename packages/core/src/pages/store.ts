import type { GeneratedPage, PageStore } from "./types.js";

export function createMemoryPageStore(): PageStore {
  const entries = new Map<string, GeneratedPage>();
  return {
    get: (key) => entries.get(key),
    set: (key, page) => { entries.set(key, page); },
  };
}
