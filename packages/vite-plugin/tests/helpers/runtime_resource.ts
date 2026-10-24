export const RUNTIME_RESOURCE_FILES = {
  "node_modules/hum-runtime-resource/package.json": JSON.stringify({
    name: "hum-runtime-resource",
    type: "module",
    exports: "./index.js",
  }),
  "node_modules/hum-runtime-resource/index.js": `import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
export function packageMessage() {
  return readFileSync(require.resolve("./message.txt"), "utf8").trim();
}
`,
  "node_modules/hum-runtime-resource/message.txt": "package resource survives\n",
};
