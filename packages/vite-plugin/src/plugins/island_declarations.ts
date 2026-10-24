import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { parseSync, type ESTree } from "rolldown/utils";
import { generateTransform, rolldownString } from "rolldown-string";
import type { Plugin } from "vite";

import {
  ISLAND_METADATA_QUERY,
  type DeclaredIsland,
  type HumContext,
} from "../shared.js";

interface Declaration extends DeclaredIsland {
  end: number;
  separator: string;
}

function definitionOf({ name, file, exportName }: DeclaredIsland): DeclaredIsland {
  return { name, file, exportName };
}

const METADATA_PREFIX = "\0hum:island-metadata:";

/** A definition ID is independent of source text, evaluation order and output. */
export function islandId(file: string, binding: string): string {
  return "i_" + createHash("sha256")
    .update(JSON.stringify([file.replace(/\\/g, "/"), binding]))
    .digest("hex").slice(0, 24);
}

export function projectFile(root: string, id: string): string | null {
  const path = id.split("?")[0]!;
  if (!isAbsolute(path) || path.includes("\0")) return null;
  const file = relative(root, path);
  if (file === "" || file === ".." || file.startsWith(`..${sep}`) || isAbsolute(file)) return null;
  return file.split(sep).join("/");
}

/** Analyze declarations without executing the module or any of its imports. */
export function islandDeclarations(code: string, file: string): Declaration[] {
  if (!code.includes("@humjs/core/shared")) return [];
  const parsed = parseSync(file, code, {
    lang: file.endsWith("x") ? "tsx" : "ts",
    sourceType: "module",
  });
  if (parsed.errors.length > 0) {
    throw new Error(`hum: cannot analyze "${file}": ${parsed.errors[0]!.message}`);
  }
  const body = parsed.program.body;
  const functions = new Set<string>();
  const namespaces = new Set<string>();
  for (const node of body) {
    if (node.type !== "ImportDeclaration" || node.source.value !== "@humjs/core/shared" || node.importKind === "type") continue;
    for (const spec of node.specifiers) {
      if (spec.type === "ImportSpecifier" && spec.importKind !== "type" &&
        (spec.imported.type === "Identifier" ? spec.imported.name : spec.imported.value) === "defineIsland") {
        functions.add(spec.local.name);
      } else if (spec.type === "ImportNamespaceSpecifier") {
        namespaces.add(spec.local.name);
      }
    }
  }
  if (functions.size === 0 && namespaces.size === 0) return [];

  const isDeclaration = (node: ESTree.Node): node is ESTree.CallExpression => {
    if (node.type !== "CallExpression") return false;
    const callee = node.callee;
    return callee.type === "Identifier" ? functions.has(callee.name) :
      callee.type === "MemberExpression" && !callee.computed &&
      callee.object.type === "Identifier" && namespaces.has(callee.object.name) &&
      callee.property.type === "Identifier" && callee.property.name === "defineIsland";
  };
  const exported = new Map<string, string[]>();
  const candidates: Array<{ binding: string; call: ESTree.CallExpression }> = [];
  const addExport = (binding: string, name: string) => {
    exported.set(binding, [...(exported.get(binding) ?? []), name]);
  };
  for (const node of body) {
    if (node.type === "ExportDefaultDeclaration") {
      if (isDeclaration(node.declaration)) {
        candidates.push({ binding: "default", call: node.declaration });
        addExport("default", "default");
      } else if (node.declaration.type === "Identifier") {
        addExport(node.declaration.name, "default");
      }
      continue;
    }
    if (node.type === "ExportNamedDeclaration" && node.source === null) {
      for (const spec of node.specifiers) {
        if (spec.type !== "ExportSpecifier" || spec.exportKind === "type") continue;
        const name = spec.exported.type === "Identifier" ? spec.exported.name : spec.exported.value;
        if (spec.local.type === "Identifier") addExport(spec.local.name, String(name));
      }
    }
    const declaration = node.type === "ExportNamedDeclaration" ? node.declaration : node;
    if (declaration?.type !== "VariableDeclaration") continue;
    for (const value of declaration.declarations) {
      if (value.id.type !== "Identifier" || value.init === null || !isDeclaration(value.init)) continue;
      candidates.push({ binding: value.id.name, call: value.init });
      if (node.type === "ExportNamedDeclaration") addExport(value.id.name, value.id.name);
    }
  }

  const accepted = new Set(candidates.map((candidate) => candidate.call));
  function bind(node: ESTree.Node, names: Set<string>): void {
    if (node.type === "Identifier") names.add(node.name);
    else if (node.type === "RestElement") bind(node.argument, names);
    else if (node.type === "AssignmentPattern") bind(node.left, names);
    else if (node.type === "ArrayPattern") {
      for (const element of node.elements) if (element) bind(element, names);
    } else if (node.type === "ObjectPattern") {
      for (const property of node.properties) {
        bind(property.type === "RestElement" ? property.argument : property.value, names);
      }
    }
  }
  function visit(node: ESTree.Node, shadowed = new Set<string>()): void {
    let scope = shadowed;
    if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") {
      scope = new Set(shadowed);
      for (const param of node.params) bind(param, scope);
      if ("id" in node && node.id) bind(node.id, scope);
    } else if (node.type === "BlockStatement") {
      scope = new Set(shadowed);
      for (const statement of node.body) {
        if (statement.type === "VariableDeclaration") {
          for (const declaration of statement.declarations) bind(declaration.id, scope);
        } else if ((statement.type === "FunctionDeclaration" || statement.type === "ClassDeclaration") && statement.id) {
          bind(statement.id, scope);
        }
      }
    } else if (node.type === "CatchClause" && node.param) {
      scope = new Set(shadowed);
      bind(node.param, scope);
    }
    const callee = node.type === "CallExpression" ? node.callee : null;
    const binding = callee?.type === "Identifier" ? callee.name :
      callee?.type === "MemberExpression" && callee.object.type === "Identifier" ? callee.object.name : null;
    if (isDeclaration(node) && binding !== null && !scope.has(binding) && !accepted.has(node)) {
      throw new Error(`hum: defineIsland() in "${file}" must directly initialize an exported module-level declaration.`);
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "parent") continue;
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === "object" && typeof child.type === "string") visit(child as ESTree.Node, scope);
        }
      } else if (value && typeof value === "object" && "type" in value && typeof value.type === "string") {
        visit(value as ESTree.Node, scope);
      }
    }
  }
  visit(parsed.program);

  return candidates.map(({ binding, call }) => {
    const names = exported.get(binding) ?? [];
    if (names.length === 0) {
      throw new Error(`hum: island "${binding}" in "${file}" must be exported.`);
    }
    if (call.arguments.length !== 1 || call.arguments[0]?.type === "SpreadElement") {
      throw new Error(`hum: defineIsland() in "${file}" takes one component; its ID is generated automatically.`);
    }
    const exportName = names.includes("default") ? "default" : names.sort()[0]!;
    if (!/^[A-Za-z_$][\w$]*$/.test(exportName)) {
      throw new Error(`hum: island export "${exportName}" in "${file}" must be an identifier.`);
    }
    const tail = code.slice(call.arguments[0]!.end, call.end - 1)
      .replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, "").trimEnd();
    return {
      name: islandId(file, binding), file, exportName, end: call.end - 1,
      separator: tail.endsWith(",") ? "" : ",",
    };
  });
}

/**
 * Vite enumerates source metadata with a glob. Metadata modules contain only
 * descriptors and lazy imports, so even server-only sources are never executed
 * or pulled into the browser just to find declarations.
 */
export function humIslandDeclarations(ctx: HumContext): Plugin {
  const definitions = ctx.islandDeclarations ??= new Map<string, DeclaredIsland[]>();
  function analyze(code: string, file: string): Declaration[] {
    const declarations = islandDeclarations(code, file);
    for (const declaration of declarations) {
      for (const [otherFile, others] of definitions) {
        if (otherFile !== file && others.some((other) => other.name === declaration.name)) {
          throw new Error(`hum: generated island ID collision in "${file}" and "${otherFile}".`);
        }
      }
    }
    definitions.set(file, declarations.map(definitionOf));
    return declarations;
  }
  return {
    name: "hum:island-declarations",
    enforce: "pre",
    sharedDuringBuild: true,
    async resolveId(source, importer) {
      if (!source.split("?")[1]?.split("&").includes(ISLAND_METADATA_QUERY)) return null;
      const resolved = await this.resolve(source.split("?")[0]!, importer, { skipSelf: true });
      if (resolved === null) return null;
      const file = projectFile(ctx.options.root, resolved.id);
      return file === null ? null : METADATA_PREFIX + file;
    },
    async load(id) {
      if (!id.startsWith(METADATA_PREFIX)) return null;
      const file = id.slice(METADATA_PREFIX.length);
      const source = resolve(ctx.options.root, file);
      this.addWatchFile(source);
      const declarations = analyze(await readFile(source, "utf8"), file);
      const entries = declarations.map((declaration) =>
        `{...${JSON.stringify(definitionOf(declaration))},load:()=>import(${JSON.stringify("/" + file)})}`
      );
      return `export default [${entries.join(",")}];`;
    },
    hotUpdate({ file, modules }) {
      const relativeFile = projectFile(ctx.options.root, file);
      if (relativeFile === null) return;
      const metadata = this.environment.moduleGraph.getModuleById(METADATA_PREFIX + relativeFile);
      if (metadata !== undefined) return [...modules, metadata];
    },
    transform(code, id) {
      if (id.includes("?") || !/\.[jt]sx?$/.test(id)) return null;
      const file = projectFile(ctx.options.root, id);
      if (file === null || file.split("/").includes("node_modules")) return null;
      const declarations = analyze(code, file);
      if (declarations.length === 0) return null;
      const result = rolldownString(code, id);
      for (const declaration of declarations) {
        result.appendLeft(declaration.end, declaration.separator + JSON.stringify(definitionOf(declaration)));
      }
      return generateTransform(result, id, true);
    },
  };
}
