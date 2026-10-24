import { parseSync, type ESTree } from "rolldown/utils";

/** A public declaration retained by a generated browser module. */
export interface ClientDeclaration {
  binding?: string;
  exportName: string;
  end: number;
}

interface Scope {
  parent?: Scope;
  functionScope: boolean;
  bindings: Map<string, ESTree.Node>;
}

function children(node: ESTree.Node): ESTree.Node[] {
  const result: ESTree.Node[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child === "object" && typeof child.type === "string") result.push(child);
    }
  }
  return result;
}

/** Remove type syntax from dependency analysis, retaining runtime expressions. */
function runtimeChildren(node: ESTree.Node): ESTree.Node[] {
  if (node.type.startsWith("TS")) {
    return "expression" in node ? [node.expression as ESTree.Node] : [];
  }
  return children(node).filter((child) => ![
    "TSTypeAnnotation", "TSTypeParameterDeclaration", "TSTypeParameterInstantiation",
  ].includes(child.type));
}

/**
 * Slice only explicit client declarations and their lexical module dependencies.
 * Imports are selected by binding, never by whether a module looks server-only.
 * External modules remain ordinary imports and must themselves be browser-safe.
 */
export function clientSlice(code: string, file: string, declarations: ClientDeclaration[]): string {
  const parsed = parseSync(file, code, { lang: file.endsWith("x") ? "tsx" : "ts", sourceType: "module" });
  if (parsed.errors.length) throw new Error(`hum: cannot split "${file}": ${parsed.errors[0]!.message}`);
  const program = parsed.program;
  const root: Scope = { functionScope: true, bindings: new Map() };
  const scopes = new WeakMap<ESTree.Node, Scope>();
  const bindings = new WeakSet<ESTree.Node>();
  const units = new Map<ESTree.Node, ESTree.Node>();
  const imports = new Map<ESTree.Node, ESTree.ImportDeclaration>();
  const exports = new Map<string, string>();
  const defaults = new Set<ESTree.Node>();
  const topLevel = new Set<ESTree.Node>();
  const fail = (message: string): never => { throw new Error(`hum: cannot split "${file}": ${message}`); };

  function bind(pattern: ESTree.Node, scope: Scope, unit: ESTree.Node): void {
    if (pattern.type === "Identifier") {
      scope.bindings.set(pattern.name, pattern);
      bindings.add(pattern);
      if (scope === root) units.set(pattern, unit);
    } else if (pattern.type === "RestElement") bind(pattern.argument, scope, unit);
    else if (pattern.type === "AssignmentPattern") bind(pattern.left, scope, unit);
    else if (pattern.type === "ArrayPattern") {
      for (const element of pattern.elements) if (element) bind(element, scope, unit);
    } else if (pattern.type === "ObjectPattern") {
      for (const property of pattern.properties) bind(property.type === "RestElement" ? property.argument : property.value, scope, unit);
    }
  }

  // Build all scopes before resolving references, including hoisted declarations.
  function index(node: ESTree.Node, incoming: Scope): void {
    let scope = incoming;
    if (node.type === "FunctionDeclaration" && node.id) bind(node.id, incoming, node);
    if (node.type === "ClassDeclaration" && node.id) bind(node.id, incoming, node);
    const fn = node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression";
    if (fn || ["BlockStatement", "CatchClause", "ForStatement", "ForInStatement", "ForOfStatement", "SwitchStatement", "ClassExpression", "ClassDeclaration"].includes(node.type)) {
      scope = { parent: incoming, functionScope: fn, bindings: new Map() };
    }
    scopes.set(node, scope);
    if (fn) {
      if (node.type !== "ArrowFunctionExpression" && node.id) bind(node.id, scope, node);
      for (const param of node.params) bind(param, scope, node);
    }
    if (node.type === "ClassExpression" && node.id) bind(node.id, scope, node);
    if (node.type === "CatchClause" && node.param) bind(node.param, scope, node);
    if (node.type === "VariableDeclaration") {
      let target = scope;
      if (node.kind === "var") while (!target.functionScope && target.parent) target = target.parent;
      for (const declaration of node.declarations) bind(declaration.id, target, declaration);
    }
    if (node.type === "ImportDeclaration") {
      for (const spec of node.specifiers) {
        bind(spec.local, scope, spec);
        imports.set(spec.local, node);
      }
    }
    for (const child of runtimeChildren(node)) index(child, scope);
  }
  index(program, root);
  for (const statement of program.body) {
    const node = statement.type === "ExportNamedDeclaration" ? statement.declaration :
      statement.type === "ExportDefaultDeclaration" ? statement.declaration : statement;
    if (node?.type === "VariableDeclaration") for (const value of node.declarations) topLevel.add(value);
    else if (node?.type === "ImportDeclaration") for (const spec of node.specifiers) topLevel.add(spec);
    else if (node) topLevel.add(node);
  }
  const unsupportedBindings = new Set<string>();
  for (const statement of program.body) {
    const node = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (node && (node.type === "TSEnumDeclaration" || node.type === "TSModuleDeclaration") && node.id.type === "Identifier") unsupportedBindings.add(node.id.name);
  }

  function resolve(name: string, scope: Scope | undefined): ESTree.Node | undefined {
    for (; scope; scope = scope.parent) {
      const binding = scope.bindings.get(name);
      if (binding) return binding;
    }
  }

  function reference(node: ESTree.Node, parent?: ESTree.Node): string | undefined {
    if (bindings.has(node)) return;
    if (node.type === "JSXIdentifier") {
      if (parent?.type === "JSXAttribute" || parent?.type === "JSXNamespacedName") return;
      if (parent?.type === "JSXMemberExpression" && parent.property === node) return;
      return /^[A-Z_$]/.test(node.name) || parent?.type === "JSXMemberExpression" ? node.name : undefined;
    }
    if (node.type !== "Identifier") return;
    if (parent?.type === "MemberExpression" && parent.property === node && !parent.computed) return;
    if ((parent?.type === "Property" || parent?.type === "MethodDefinition" || parent?.type === "PropertyDefinition") && parent.key === node && !parent.computed) return;
    if (parent?.type === "LabeledStatement" || parent?.type === "BreakStatement" || parent?.type === "ContinueStatement") return;
    if (parent?.type === "ExportSpecifier" || parent?.type.startsWith("Import")) return;
    return node.name;
  }

  const selected = new Set<ESTree.Node>();
  function retain(unit: ESTree.Node): void {
    if (selected.has(unit)) return;
    if (!topLevel.has(unit)) fail("client dependency is initialized inside module-level control flow; move it into the component/factory or an imported module.");
    selected.add(unit);
    function visit(node: ESTree.Node, parent?: ESTree.Node): void {
      if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "eval" && !resolve("eval", scopes.get(node))) {
        fail("direct eval cannot preserve lexical dependencies across code extraction.");
      }
      const name = reference(node, parent);
      if (name) {
        if (unsupportedBindings.has(name) && !resolve(name, scopes.get(node))) fail(`runtime TypeScript dependency "${name}" must live in a browser-safe imported module.`);
        const binding = resolve(name, scopes.get(node));
        const dependency = binding && units.get(binding);
        if (dependency) retain(dependency);
        else if (!binding && ["process", "Buffer", "require", "__dirname", "__filename"].includes(name)) {
          fail(`client declaration references server global "${name}".`);
        }
      }
      for (const child of runtimeChildren(node)) visit(child, node);
    }
    visit(unit);
  }

  for (const statement of program.body) {
    if (statement.type === "ExportNamedDeclaration") {
      if (!statement.source) for (const spec of statement.specifiers) {
        if (spec.type === "ExportSpecifier" && spec.local.type === "Identifier") {
          exports.set(String(spec.exported.type === "Identifier" ? spec.exported.name : spec.exported.value), spec.local.name);
        }
      }
      const declaration = statement.declaration;
      if (declaration?.type === "VariableDeclaration") for (const value of declaration.declarations) {
        if (value.id.type === "Identifier") exports.set(value.id.name, value.id.name);
      }
    } else if (statement.type === "ExportDefaultDeclaration") {
      if (statement.declaration.type === "Identifier") exports.set("default", statement.declaration.name);
      else defaults.add(statement.declaration);
    }
  }
  for (const declaration of declarations) {
    const local = declaration.binding ?? exports.get(declaration.exportName);
    if (local) {
      const binding = root.bindings.get(local);
      const unit = binding && units.get(binding);
      if (!unit) fail(`cannot resolve client export "${declaration.exportName}".`);
      retain(unit!);
    } else {
      const unit = [...defaults].find((node) => declaration.end >= node.start && declaration.end < node.end);
      if (!unit) fail(`cannot resolve client export "${declaration.exportName}".`);
      retain(unit!);
    }
  }

  function safeInitializer(node: ESTree.Node): boolean {
    if (["ArrowFunctionExpression", "FunctionExpression", "Literal", "Identifier"].includes(node.type)) return true;
    if (["CallExpression", "NewExpression", "AwaitExpression", "AssignmentExpression", "UpdateExpression", "TaggedTemplateExpression", "MemberExpression", "SpreadElement"].includes(node.type)) return false;
    return runtimeChildren(node).every(safeInitializer);
  }
  const declarationEnds = new Set(declarations.map((declaration) => declaration.end));
  const output: string[] = [];
  for (const statement of program.body) {
    if (statement.type === "ImportDeclaration") {
      if (statement.importKind === "type") continue;
      if (statement.specifiers.length === 0) {
        if (!/\.(?:css|scss|sass|less|styl)(?:\?|$)/.test(String(statement.source.value))) {
          fail("bare side-effect imports are ambiguous; move server initialization into a separate server module, or import explicit client dependencies.");
        }
        output.push(code.slice(statement.start, statement.end));
        continue;
      }
      const specs = statement.specifiers.filter((spec) => selected.has(spec));
      if (!specs.length) continue;
      const source = String(statement.source.value);
      if (source.startsWith("node:") || source === "@humjs/core") fail(`client declaration depends on server import "${source}".`);
      const names = specs.filter((spec) => spec.type === "ImportSpecifier").map((spec) => code.slice(spec.start, spec.end));
      const other = specs.filter((spec) => spec.type !== "ImportSpecifier").map((spec) => code.slice(spec.start, spec.end));
      if (names.length) other.push(`{ ${names.join(", ")} }`);
      output.push(`import ${other.join(", ")} from ${JSON.stringify(source)}${code.slice(statement.source.end, statement.end)}`);
      continue;
    }
    const node = statement.type === "ExportNamedDeclaration" ? statement.declaration :
      statement.type === "ExportDefaultDeclaration" ? statement.declaration : statement;
    if (!node) continue;
    if (node.type === "VariableDeclaration") {
      for (const value of node.declarations) {
        if (!selected.has(value)) continue;
        if (node.kind !== "const") fail("client dependencies must use const; module-level let/var state cannot be copied between server and browser.");
        const isDefinition = value.init && declarationEnds.has(value.init.end - 1);
        if (value.init && !isDefinition && !safeInitializer(value.init)) {
          fail("client dependency has an effectful initializer; move initialization into the component/factory, or a browser-safe imported module.");
        }
        output.push(`const ${code.slice(value.start, value.end)};`);
      }
    } else if (selected.has(node)) {
      if (node.type === "ClassDeclaration" || node.type === "ClassExpression") fail("module-level classes must live in a browser-safe imported module.");
      output.push((statement.type === "ExportDefaultDeclaration" ? "export default " : "") + code.slice(node.start, node.end) + ";");
    }
  }

  // Reject mutations from omitted code: copying just an initializer would change
  // the value observed by the extracted component/factory.
  function mutations(node: ESTree.Node, retained = false): void {
    retained ||= selected.has(node);
    if (!retained && (node.type === "AssignmentExpression" || node.type === "UpdateExpression")) {
      let target: ESTree.Node = node.type === "AssignmentExpression" ? node.left : node.argument;
      while (target.type === "MemberExpression") target = target.object;
      if (target.type === "Identifier") {
        const binding = resolve(target.name, scopes.get(target));
        if (binding && selected.has(units.get(binding)!)) fail(`omitted code mutates client dependency "${target.name}".`);
      }
    }
    for (const child of runtimeChildren(node)) mutations(child, retained);
  }
  mutations(program);
  function omittedEffects(node: ESTree.Node): void {
    if (selected.has(node) || ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node.type)) return;
    // Direct calls can mutate objects through methods or arguments, even without
    // an assignment expression. Never silently omit such initialization.
    if (node.type === "CallExpression" || node.type === "NewExpression") {
      const inspect = (child: ESTree.Node, parent?: ESTree.Node): void => {
        if (["FunctionExpression", "ArrowFunctionExpression"].includes(child.type)) return;
        const name = reference(child, parent);
        const binding = name && resolve(name, scopes.get(child));
        if (binding && selected.has(units.get(binding)!)) fail(`omitted initialization uses client dependency "${name}"; move that initialization into the component/factory or an imported module.`);
        for (const value of runtimeChildren(child)) inspect(value, child);
      };
      inspect(node);
    }
    for (const child of runtimeChildren(node)) omittedEffects(child);
  }
  omittedEffects(program);
  for (const declaration of declarations) {
    const local = declaration.binding ?? exports.get(declaration.exportName);
    if (local) output.push(declaration.exportName === "default" ? `export default ${local};` : `export { ${local} as ${declaration.exportName} };`);
  }
  return output.join("\n");
}
