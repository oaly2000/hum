import { defineConfig, loadEnv } from "vite";
import { hum } from "@humjs/vite-plugin";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), [
    "STORE_",
    "CREEM_",
    "BETTER_AUTH_",
  ]);
  for (const [key, value] of Object.entries(env)) process.env[key] ??= value;
  return { plugins: [...hum({ devEntry: "app.ts" })] };
});
