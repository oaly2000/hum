let BUILD_ID = "dev";

/** Internal: keeps `asset()` in sync with the running build. */
export function setBuildId(id: string): void {
  BUILD_ID = id;
}

/**
 * Returns a cache-busted URL for a static asset. Only same-origin, absolute
 * paths are rewritten; everything else is returned untouched.
 */
export function asset(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const url = new URL(path, "https://hum-asset.local");
  if (url.searchParams.has("__hum_build")) return path;
  url.searchParams.set("__hum_build", BUILD_ID);
  return url.pathname + url.search + url.hash;
}
