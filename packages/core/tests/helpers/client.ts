import { afterEach, vi } from "vitest";
import { boot, currentInteractionManager } from "../../src/runtime/boot.js";

/** Let scheduled hydration and signal writes finish. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function setupClientCleanup(): void {
  afterEach(() => {
    currentInteractionManager()?.dispose();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
}

/** Put server-rendered content in place and await initial hydration. */
export async function hydrate(html: string, payload: string): Promise<void> {
  document.body.innerHTML = html;
  boot({}, payload);
  await flush();
}

export function click(selector: string): void {
  document.querySelector<HTMLElement>(selector)!.dispatchEvent(new Event("click"));
}

export function text(selector: string): string {
  return document.querySelector(selector)!.textContent ?? "";
}
