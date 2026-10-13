/**
 * Removes a package's build output before rebuilding it.
 *
 * `tsc` never prunes `dist`, so deleting a source file leaves its compiled
 * output behind, and the stale file keeps importing a module that no longer
 * exists (or ships in the published tarball).
 *
 * Usage: `node tools/clean-dist.mjs [dir]` — `dir` is resolved against the
 * current working directory and defaults to `dist`.
 */
import { readdirSync, rmdirSync, rmSync, unlinkSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

const cwd = process.cwd();
const target = resolve(cwd, process.argv[2] ?? "dist");
const rel = relative(cwd, target);

if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
  throw new Error(`hum: refusing to clean "${target}", it is outside ${cwd}.`);
}

try {
  rmSync(target, { recursive: true, force: true });
} catch (error) {
  // Some environments replace `fs.rm` with a recycle-bin shim that can abort on
  // a larger tree. Walk the tree instead so the build is not blocked.
  try {
    removeTree(target);
  } catch {
    throw new Error(`hum: could not clean "${rel}": ${String(error)}`);
  }
}

function removeTree(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) removeTree(path);
    else unlinkSync(path);
  }
  rmdirSync(directory);
}
