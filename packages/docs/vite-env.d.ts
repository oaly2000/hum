/// <reference types="vite/client" />

declare module "virtual:hum/build" {
  import type { HumBuild } from "@humjs/core/build";
  import type { HumConfig } from "@humjs/core";
  export const build: HumBuild;
  export const config: HumConfig;
}
