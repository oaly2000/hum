/// <reference types="vite/client" />

declare module "virtual:hum/build" {
  import type { HumBuild, HumConfig } from "@humjs/core";
  export const build: HumBuild;
  export const config: HumConfig;
}
