import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export type ProjectFiles = Record<string, string>;

export async function writeProjectFiles(root: string, files: ProjectFiles): Promise<void> {
  for (const [file, source] of Object.entries(files)) {
    const path = join(root, file);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, source);
  }
}

/** Keep fixtures in the package so dependencies resolve as in an installed app. */
export async function createProject(files: ProjectFiles, prefix = "fixture-"): Promise<string> {
  const root = await mkdtemp(join(resolve(process.cwd(), "packages/vite-plugin"), prefix));
  try {
    await writeProjectFiles(root, {
      "package.json": JSON.stringify({ name: "hum-test-fixture", type: "module" }) + "\n",
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          jsxImportSource: "preact",
          skipLibCheck: true,
        },
      }) + "\n",
      ...files,
    });
    return root;
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
