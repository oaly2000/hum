/// <reference types="vite/client" />

/**
 * The module the Vite plugin generates: importing it registers the routes, the
 * islands and the client assets with the runtime. The server entry of a build
 * imports it as generated code, which is why nothing else has to declare it —
 * `dev-worker.ts` imports it from source.
 */
declare module "virtual:hum/build" {
  import type { HumBuild } from "@humjs/core";

  export const build: HumBuild;
}
