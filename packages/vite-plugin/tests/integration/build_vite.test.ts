import { rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { preactSsrPrecompile } from "@humjs/preact-ssr-precompile";
import { buildProject, serverSources } from "../helpers/build.js";

import { RUNTIME_RESOURCE_FILES } from "../helpers/runtime_resource.js";

describe("Vite production pipeline", () => {
  it.each([false, true])("keeps external dependencies configured by earlier environment hooks (standalone: %s)", async (standalone) => {
    const resourcePage = `import { packageMessage } from "hum-runtime-resource";
export default () => <p>{packageMessage()}</p>;`;
    const root = await buildProject({
      entry: "app",
      standalone,
      files: RUNTIME_RESOURCE_FILES,
      plugins: [{
        name: "fixture-environment-externals",
        configEnvironment(name, config) {
          if (name === "ssr") {
            config.resolve = {
              ...config.resolve,
              external: ["hum-runtime-resource"],
              noExternal: true,
            };
          }
        },
      }],
      routes: {
        "index.tsx": resourcePage,
        "static.tsx": `export const config = { render: { mode: "ssg" } };\n${resourcePage}`,
      },
    });
    try {
      expect(await serverSources(join(root, "dist"))).toContain('"hum-runtime-resource"');
      const { default: app } = await import(pathToFileURL(join(root, "dist", "server.js")).href);
      for (const path of ["/", "/static"]) {
        const response = await app.request(path);
        expect(response.status).toBe(200);
        expect(await response.text()).toContain("package resource survives");
      }
      expect(app.hum.build.pages["/static"].body).toContain("package resource survives");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("applies user JavaScript transforms once to standalone source modules", async () => {
    const root = await buildProject({
      entry: "app",
      standalone: true,
      files: { "message.js": 'export const message = "once";' },
      plugins: [{
        name: "fixture-transform-once",
        transform(code, id) {
          if (id.replace(/\\/g, "/").endsWith("/message.js")) {
            return code.replaceAll("twice", "three-times").replaceAll("once", "twice");
          }
        },
      }],
      routes: {
        "index.tsx": `import { message } from "../message.js";
export default () => <p>{message}</p>;`,
      },
    });
    try {
      const { default: app } = await import(pathToFileURL(join(root, "dist", "server.js")).href);
      const response = await app.request("/");
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain(">twice</p>");
      expect(html).not.toContain("three-times");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([false, true])("preserves Vite resolution, loading, aliases and defines (standalone: %s)", async (standalone) => {
    const root = await buildProject({
      entry: "app",
      standalone,
      configure: (root) => ({
        resolve: { alias: { "#fixture-message": join(root, "message.ts") } },
        define: { __FIXTURE_BUILD__: JSON.stringify("defined") },
        environments: {
          ssr: { define: { __FIXTURE_SSR__: JSON.stringify("server-defined") } },
        },
      }),
      files: { "message.ts": 'export const message = "aliased";' },
      plugins: [{
        name: "fixture-virtual-module",
        applyToEnvironment(environment) {
          return environment.name === "ssr";
        },
        resolveId(id) {
          if (id === "virtual:fixture-message") return "\0fixture-message";
        },
        load(id) {
          if (id === "\0fixture-message") return 'export const value = "loaded";';
        },
      }],
      routes: {
        "index.tsx": `import { define } from "@humjs/core";
import { value } from "virtual:fixture-message";
import { message } from "#fixture-message";
export const config = define.config({ render: { mode: "ssg" } });
export default () => <p>{value}:{message}:{__FIXTURE_BUILD__}:{__FIXTURE_SSR__}</p>;
`,
      },
    });
    try {
      const { default: app } = await import(pathToFileURL(join(root, "dist", "server.js")).href);
      const response = await app.request("/");
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("loaded:aliased:defined:server-defined");
      expect(app.hum.build.pages["/"].body).toContain("loaded:aliased:defined:server-defined");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("forwards user Vite transforms into the production server build", async () => {
    const plainRoot = await buildProject({ entry: "app" });
    const precompiledRoot = await buildProject({
      entry: "app",
      plugins: [preactSsrPrecompile()],
    });

    try {
      // Mount each app while its build is registered. Separate deployed apps
      // share the external framework in this test process.
      const plain = await import(
        pathToFileURL(join(plainRoot, "dist", "server.js")).href
      ) as { default: { fetch: typeof fetch } };
      const plainResponse = await plain.default.fetch(new Request("http://localhost/"));
      expect(plainResponse.status).toBe(200);
      const plainHtml = await plainResponse.text();

      const precompiled = await import(
        pathToFileURL(join(precompiledRoot, "dist", "server.js")).href
      ) as { default: { fetch: typeof fetch } };
      const precompiledResponse = await precompiled.default.fetch(new Request("http://localhost/"));
      expect(precompiledResponse.status).toBe(200);
      const precompiledHtml = await precompiledResponse.text();
      const main = (html: string) =>
        html.slice(html.indexOf("<main"), html.indexOf("</main>") + 7);
      expect(plainHtml).not.toContain("data-hum-key");
      expect(precompiledHtml).toContain('data-hum-key="first"');
      expect(precompiledHtml).toContain('data-hum-key="second"');
      expect(main(precompiledHtml).replace(/ data-hum-key="[^"]*"/g, ""))
        .toBe(main(plainHtml));
    } finally {
      await Promise.all([
        rm(plainRoot, { recursive: true, force: true }),
        rm(precompiledRoot, { recursive: true, force: true }),
      ]);
    }
  });
});
