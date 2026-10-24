import { relative, resolve } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import type { HumContext } from "../shared.js";

export const STYLES_ID = "virtual:hum/styles";
export const STYLE_QUERY = "hum-route-styles";
export const STYLES_OUTPUT = "_generated/hum-styles.js";
const STYLE_PREFIX = "\0hum:route-styles:";

export function isStylesheet(id: string): boolean {
  return /\.(css|less|sass|scss|styl|stylus)$/.test(id);
}

export function isCssModule(id: string): boolean {
  return /\.module\.(css|less|sass|scss|styl|stylus)$/.test(id);
}

/** Static source dependencies, independent of the server's chunk layout. */
export function cssDependencies(graph: Map<string, string[]>, entry: string): string[] {
  const seen = new Set<string>();
  const styles = new Set<string>();
  function visit(id: string) {
    if (seen.has(id)) return;
    seen.add(id);
    for (const dependency of graph.get(id) ?? []) visit(dependency);
    if (isStylesheet(id)) styles.add(id);
  }
  visit(entry);
  return [...styles];
}

export function stylesSource(ctx: HumContext): string {
  return `export default ${JSON.stringify(ctx.styles ?? {})};\n`;
}

/** Route metadata uses Vite's graph; application modules are never evaluated here. */
export function humStyles(ctx: HumContext): Plugin {
  let server: ViteDevServer | undefined;
  return {
    name: "hum:styles",
    enforce: "pre",
    sharedDuringBuild: true,
    configureServer(value) { server = value; },
    hotUpdate({ file, modules, server }) {
      // A CSS edit can change scoped class names. Linked styles alone cannot
      // update server-rendered class attributes, including in platform runtimes.
      if (this.environment.name === "client" &&
        (isCssModule(file) || modules.some(mod => mod.file !== null && isCssModule(mod.file)))) {
        server.ws.send({ type: "full-reload", path: "*" });
      }
    },
    async resolveId(id, importer) {
      if (id === STYLES_ID) return "\0" + id;
      if (id.endsWith("?" + STYLE_QUERY)) {
        const source = await this.resolve(id.slice(0, -(STYLE_QUERY.length + 1)), importer, { skipSelf: true });
        if (source) return STYLE_PREFIX + relative(ctx.options.root, source.id).replace(/\\/g, "/");
      }
      return null;
    },
    async load(id) {
      if (id === "\0" + STYLES_ID) return stylesSource(ctx);
      if (!id.startsWith(STYLE_PREFIX)) return null;
      const key = id.slice(STYLE_PREFIX.length);
      const file = resolve(ctx.options.root, key).replace(/\\/g, "/");
      if (!server) {
        return `import styles from ${JSON.stringify(STYLES_ID)}; export default () => styles[${JSON.stringify(key)}] ?? [];`;
      }
      const environment = server.environments.ssr!;
      const graph = new Map<string, string[]>();
      const visit = async (source: string): Promise<void> => {
        if (graph.has(source) || source.startsWith("\0")) return;
        graph.set(source, []);
        this.addWatchFile(source.split("?")[0]!);
        if (isStylesheet(source)) return;
        const transformed = await environment.transformRequest(source);
        for (const dependency of transformed?.deps ?? []) {
          const resolved = await environment.pluginContainer.resolveId(dependency, source);
          if (!resolved || resolved.external) continue;
          graph.get(source)!.push(resolved.id);
          await visit(resolved.id);
        }
      };
      await visit(file);
      const urls = cssDependencies(graph, file).map(source => {
        const path = relative(ctx.options.root, source).replace(/\\/g, "/");
        return path.startsWith("../") ? `/@fs/${source}?direct` : `/${path}?direct`;
      });
      return `export default () => ${JSON.stringify(urls)};`;
    },
    generateBundle() {
      if (this.environment.name !== "ssr" || ctx.stylesPass) return;
      const graph = new Map<string, string[]>();
      for (const id of this.getModuleIds()) {
        if (id.startsWith(STYLE_PREFIX)) continue;
        const info = this.getModuleInfo(id);
        if (info) graph.set(id, [...info.importedIds]);
      }
      ctx.styleDependencies = new Map();
      const routes = resolve(ctx.options.root, ctx.options.routesDir).replace(/\\/g, "/") + "/";
      for (const id of graph.keys()) {
        const file = relative(ctx.options.root, id).replace(/\\/g, "/");
        if (!id.startsWith(routes)) continue;
        if (id.includes("?")) continue;
        const dependencies = cssDependencies(graph, id);
        if (dependencies.length) ctx.styleDependencies.set(file, dependencies);
      }
    },
  };
}
