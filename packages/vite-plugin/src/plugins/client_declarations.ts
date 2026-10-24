import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { parseSync, type ESTree } from "rolldown/utils";
import { generateTransform, rolldownString } from "rolldown-string";
import type { Plugin } from "vite";

import {
  CLIENT_SLICE_QUERY,
  CLIENT_METADATA_QUERY,
  type DeclaredClientDefinition,
  type HumContext,
} from "../shared.js";

import { clientSlice } from "./client_slice.js";

interface Declaration extends DeclaredClientDefinition {
  end: number;
  separator: string;
}

function definitionOf({ kind, name, file, exportName, binding }: DeclaredClientDefinition): DeclaredClientDefinition {
  return { kind, name, file, exportName, binding };
}

const METADATA_PREFIX = "\0hum:client-metadata:";

/** A definition ID is independent of source text, evaluation order and output. */
export function islandId(file: string, binding: string): string {
  return "i_" + createHash("sha256")
    .update(JSON.stringify([file.replace(/\\/g, "/"), binding]))
    .digest("hex").slice(0, 24);
}

export function factoryId(file: string, binding: string): string {
  return "f_" + islandId(file, binding).slice(2);
}

export function projectFile(root: string, id: string): string | null {
  const path = id.split("?")[0]!;
  if (!isAbsolute(path) || path.includes("\0")) return null;
  const file = relative(root, path);
  if (file === "" || file === ".." || file.startsWith(`..${sep}`) || isAbsolute(file)) return null;
  return file.split(sep).join("/");
}

/** Analyze declarations without executing the module or any of its imports. */
export function interactionDeclarations(code: string, file: string): Declaration[] {
  if (!code.includes("@humjs/core/shared") && !code.includes("@humjs/core/events")) return [];
  const parsed = parseSync(file, code, {
    lang: file.endsWith("x") ? "tsx" : "ts",
    sourceType: "module",
  });
  if (parsed.errors.length > 0) {
    throw new Error(`hum: cannot analyze "${file}": ${parsed.errors[0]!.message}`);
  }
  const body = parsed.program.body;
  const functions = new Map<string, "island" | "factory">();
  const namespaces = new Map<string, "island" | "factory">();
  for (const node of body) {
    if (node.type !== "ImportDeclaration" || !["@humjs/core/shared", "@humjs/core/events"].includes(String(node.source.value)) || node.importKind === "type") continue;
    const kind = node.source.value === "@humjs/core/shared" ? "island" : "factory";
    const helper = kind === "island" ? "defineIsland" : "defineFactory";
    for (const spec of node.specifiers) {
      if (spec.type === "ImportSpecifier" && spec.importKind !== "type" &&
        (spec.imported.type === "Identifier" ? spec.imported.name : spec.imported.value) === helper) {
        functions.set(spec.local.name, kind);
      } else if (spec.type === "ImportNamespaceSpecifier") {
        namespaces.set(spec.local.name, kind);
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
      callee.property.type === "Identifier" && callee.property.name === (namespaces.get(callee.object.name) === "island" ? "defineIsland" : "defineFactory");
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
      throw new Error(`hum: client declaration in "${file}" must directly initialize a module-level declaration.`);
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
    const callee = call.callee;
    const kind = callee.type === "Identifier" ? functions.get(callee.name)! :
      callee.type === "MemberExpression" && callee.object.type === "Identifier" ? namespaces.get(callee.object.name)! : "island";
    if (kind === "island" && (call.arguments.length !== 1 || call.arguments[0]?.type === "SpreadElement")) {
      throw new Error(`hum: defineIsland() in "${file}" takes one component; its ID is generated automatically.`);
    }
    if (kind === "factory" && (call.arguments.length !== 1 || call.arguments[0]?.type === "SpreadElement")) {
      throw new Error(`hum: defineFactory() in "${file}" takes one factory function; its ID is generated automatically.`);
    }
    const name = kind === "island" ? islandId(file, binding) : factoryId(file, binding);
    let exportName = names.includes("default") ? "default" : names.sort()[0];
    if (exportName === undefined) {
      exportName = `__hum_${name}`;
      const used = new Set([...exported.values()].flat());
      while (used.has(exportName)) exportName += "_";
    }
    if (!/^[A-Za-z_$][\w$]*$/.test(exportName)) {
      throw new Error(`hum: client export "${exportName}" in "${file}" must be an identifier.`);
    }
    const tail = code.slice(call.arguments[0]!.end, call.end - 1)
      .replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, "").trimEnd();
    return {
      kind, name, file, exportName, binding: binding === "default" ? undefined : binding, end: call.end - 1,
      separator: tail.endsWith(",") ? "" : ",",
    };
  });
}

/** Island-only analysis retained for tools that consume island descriptors. */
export function islandDeclarations(code: string, file: string): Declaration[] {
  return interactionDeclarations(code, file).filter((entry) => entry.kind === "island");
}

/**
 * Vite enumerates source metadata with a glob. Metadata modules contain only
 * descriptors and lazy imports, so even server-only sources are never executed
 * or pulled into the browser just to find declarations.
 */
export function humClientDeclarations(ctx: HumContext): Plugin {
  const definitions = ctx.clientDeclarations ??= new Map<string, DeclaredClientDefinition[]>();
  function analyze(code: string, file: string): Declaration[] {
    const declarations = interactionDeclarations(code, file);
    const seen = new Set<string>();
    for (const declaration of declarations) {
      const key = declaration.kind + ":" + declaration.name;
      if (seen.has(key)) throw new Error(`hum: duplicate client declaration identity in "${file}".`);
      seen.add(key);
      for (const [otherFile, others] of definitions) {
        if (otherFile !== file && others.some((other) => other.kind === declaration.kind && other.name === declaration.name)) {
          throw new Error(`hum: duplicate client declaration identity in "${file}" and "${otherFile}".`);
        }
      }
    }
    definitions.set(file, declarations.map(definitionOf));
    return declarations;
  }
  return {
    name: "hum:client-declarations",
    enforce: "pre",
    sharedDuringBuild: true,
    async resolveId(source, importer) {
      const query = source.split("?")[1]?.split("&");
      if (!query?.includes(CLIENT_METADATA_QUERY) && !query?.includes(CLIENT_SLICE_QUERY)) return null;
      const resolved = await this.resolve(source.split("?")[0]!, importer, { skipSelf: true });
      if (resolved === null) return null;
      const file = projectFile(ctx.options.root, resolved.id);
      return file === null ? null : query.includes(CLIENT_SLICE_QUERY) ? resolved.id + "?" + CLIENT_SLICE_QUERY : METADATA_PREFIX + file;
    },
    async load(id) {
      if (id.endsWith("?" + CLIENT_SLICE_QUERY)) {
        const file = projectFile(ctx.options.root, id)!;
        const source = resolve(ctx.options.root, file);
        this.addWatchFile(source);
        const code = await readFile(source, "utf8");
        return clientSlice(code, file, analyze(code, file));
      }
      if (!id.startsWith(METADATA_PREFIX)) return null;
      const file = id.slice(METADATA_PREFIX.length);
      const source = resolve(ctx.options.root, file);
      this.addWatchFile(source);
      const declarations = analyze(await readFile(source, "utf8"), file);
      const entries = declarations.map((declaration) =>
        `{...${JSON.stringify({...definitionOf(declaration), clientFile: file + "?" + CLIENT_SLICE_QUERY})},load:()=>import(${JSON.stringify("/" + file + (this.environment.name === "client" ? "?" + CLIENT_SLICE_QUERY : ""))})}`
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
      if ((id.includes("?") && !id.endsWith("?" + CLIENT_SLICE_QUERY)) || !/\.[jt]sx?$/.test(id.split("?")[0]!)) return null;
      const file = projectFile(ctx.options.root, id);
      if (file === null || file.split("/").includes("node_modules")) return null;
      const declarations = analyze(code, file);
      if (declarations.length === 0) return null;
      const result = rolldownString(code, id);
      for (const declaration of declarations) {
        result.appendLeft(declaration.end, declaration.separator + JSON.stringify(declaration.kind === "island" ? definitionOf(declaration) : declaration.name));
      }
      return generateTransform(result, id, true);
    },
  };
}
