import { isAbsolute, relative, sep } from "node:path";

import {
  type IslandTag,
  ISLAND_TAG_KEY,
  islandNameOfFile,
} from "@humjs/core/routing";
import type { Plugin } from "vite";

import type { HumContext } from "../shared.js";

/**
 * Stamps every island module with the island it is.
 *
 * The renderer has to answer "is this component an island?" while it walks the
 * vnode tree, and the only handle it has is the component itself. Keeping a
 * table of the components the bundler loaded would answer that with the
 * identity of a module instance — which a runtime that instantiates a module
 * more than once cannot guarantee, and which is why island recognition used to
 * depend on the dev module runner's cache. Writing the answer onto the
 * component instead means the component carries its own identity wherever it
 * came from, and the renderer only needs a name it can look up in the build.
 *
 * The tag is a well known symbol, so the emitted code imports nothing.
 */
export function humIslandTags(ctx: HumContext): Plugin {
  return {
    name: "hum:island-tags",

    transform(code, id) {
      const file = projectFileOf(ctx.options.root, id);
      if (file === null) return null;

      const name = islandNameOfFile(file, ctx.options);
      if (name === null) return null;

      const tag: IslandTag = { name, file, exportName: "default" };
      const tagged = tagDefaultExport(code, tag);
      if (tagged === null) {
        this.warn(
          `hum: "${file}" is an island but has no default export, so nothing ` +
            `can hydrate it. Add one, or move the file out of the islands ` +
            `directory.`,
        );
        return null;
      }

      return { code: tagged, map: null };
    },
  };
}

/** Binding the rewritten default export is passed through. */
const LOCAL = "__hum_island_default";

/** Path of a module relative to the project root, or `null` for anything else. */
function projectFileOf(root: string, id: string): string | null {
  const file = id.split("?")[0] ?? "";
  // Virtual modules are addressed by identifiers that are not paths.
  if (file === "" || file.includes("\0") || !isAbsolute(file)) return null;

  const rel = relative(root, file);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel.split(sep).join("/");
}

/**
 * Rewrites a module's default export so the component it exports carries its
 * island identity, and returns `null` when the module has no default export to
 * rewrite.
 *
 * `export default <expression>` becomes a named binding Hum can tag, and the
 * statement is re-exported under its original name. The tag is only written
 * when the export can hold one, so a module whose default export is a value
 * still builds — it simply is not an island.
 */
function tagDefaultExport(code: string, tag: IslandTag): string | null {
  const tagStatement = (identifier: string): string =>
    `\nif (typeof ${identifier} === "function" || ` +
    `(typeof ${identifier} === "object" && ${identifier} !== null)) {\n` +
    `  ${identifier}[Symbol.for(${JSON.stringify(ISLAND_TAG_KEY)})] = ` +
    `${JSON.stringify(tag)};\n}\n`;

  // `export default <expression>` — a function, a class, an arrow function or a
  // reference all become a binding the same way.
  const statement = /^[ \t]*export[ \t]+default[ \t]+/m;
  if (statement.test(code)) {
    return code.replace(statement, `const ${LOCAL} = `) +
      `\nexport default ${LOCAL};\n${tagStatement(LOCAL)}`;
  }

  // `export { Counter as default }` — the export clause names the binding.
  const clause = /^[ \t]*export[ \t]*\{([^}]*)\}/m.exec(code);
  const alias = clause === null
    ? null
    : /([A-Za-z_$][\w$]*)[ \t]+as[ \t]+default[ \t]*/.exec(clause[1] ?? "");
  if (alias === null) return null;

  return code + tagStatement(alias[1] as string);
}
