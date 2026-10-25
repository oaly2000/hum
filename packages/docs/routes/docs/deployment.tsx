import { define, type RouteProps } from "@humjs/core";
import { CodeBlock } from "../_components/CodeBlock.js";

export const head = define.head(<title>Deployment — Hum Guides</title>);

const standaloneExample = `// Add standalone to your existing Hum plugin options.
// Keep your other Vite plugins.
hum({ devEntry: "app.ts", standalone: true })`;

const standaloneBuildExample = `npm run build
node dist/server.js`;

const standaloneOutputExample = `dist/
  server.js       bundled server
  package.json    ESM marker
  public/
    _hum/         client runtime, island chunks and styles
    ...           the project's public files`;

const ordinaryBuildExample = `npm ci
npm run build`;

const ordinaryOutputExample = `deployment/
  package.json         the application's original manifest
  package-lock.json    matching lockfile
  dist/                the complete Hum build
    server.js
    package.json       Hum's ESM marker
    public/`;

const ordinaryInstallExample = `# On the server, from the deployment directory:
npm ci --omit=dev
node dist/server.js`;

const workspaceExample = `# pnpm-workspace.yaml — merge with your existing settings
injectWorkspacePackages: true
syncInjectedDepsAfterScripts:
  - build`;

const filesExample = `{
  "files": ["dist"]
}`;

const scriptsExample = `{
  "scripts": {
    "deploy:docs": "pnpm build && pnpm --filter hum-docs deploy --prod ../hum-deploy"
  }
}`;

const firstDeployExample = `pnpm install --no-frozen-lockfile
pnpm deploy:docs
node ../hum-deploy/dist/server.js`;

const ciExample = `pnpm install --frozen-lockfile
pnpm deploy:docs`;

const outputExample = `hum-deploy/
  package.json
  node_modules/       production dependencies, including workspace packages
  dist/
    server.js
    app.js
    routes/
    _generated/
    package.json      ESM marker
    public/           the only directory to serve as static files`;

export default function Deployment(_props: RouteProps) {
  return (
    <article>
      <h1 class="text-3xl font-black tracking-tight sm:text-4xl">Deployment</h1>
      <p class="mt-5 text-lg leading-8 text-muted">
        Start with a standalone build: copy the output to your server and run
        it without installing npm dependencies. If your dependencies need their
        installed files, use a non-standalone build and deploy its production
        dependencies alongside it.
      </p>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        Standalone: build and copy
      </h2>
      <p class="mt-3 leading-7 text-muted">
        Add <code>standalone: true</code> to your existing Hum plugin options in
        the Vite configuration, keeping the other plugins:
      </p>
      <CodeBlock code={standaloneExample} language="typescript" />
      <p class="mt-3 leading-7 text-muted">
        Build the application, then start it locally to check the result:
      </p>
      <CodeBlock code={standaloneBuildExample} language="bash" />
      <p class="mt-3 leading-7 text-muted">
        Copy the entire <code>dist/</code> directory to your server and run{" "}
        <code>node dist/server.js</code> there using Node.js 22.18 or later.
        Server dependencies are bundled into ESM <code>server.js</code>; Node
        built-ins remain external. No <code>node_modules</code> or dependency
        installation is needed on the server.
      </p>
      <CodeBlock code={standaloneOutputExample} language="text" />
      <p class="mt-3 leading-7 text-muted">
        The directory can be renamed or relocated: asset URLs use{" "}
        <code>/_hum/</code>, independent of its name. Serve only its{" "}
        <code>public/</code> tree as static files. Include any additional
        application resources loaded through runtime-computed paths too. The
        Cloudflare template already enables standalone mode and configures an
        asset binding for <code>public/</code>.
      </p>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        When dependencies need their installed files
      </h2>
      <p class="mt-3 leading-7 text-muted">
        Some dependencies cannot be bundled into a standalone server. Native
        addons need platform binaries, and some packages read resources or
        resolve modules relative to their installed package directory. For
        these applications, omit <code>standalone</code> or set it to{" "}
        <code>false</code>. This is Hum's default build mode.
      </p>
      <p class="mt-3 leading-7 text-muted">
        The non-standalone build preserves server modules and keeps npm
        dependencies external. Deploy it alongside production dependencies
        installed from the application's manifest and lockfile. Node's normal
        dependency resolution keeps native addons and package resources
        available.
      </p>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        Install production dependencies
      </h2>
      <p class="mt-3 leading-7 text-muted">
        For a project whose dependencies are available from a registry, build
        locally with development dependencies installed. For example, using npm:
      </p>
      <CodeBlock code={ordinaryBuildExample} language="bash" />
      <p class="mt-3 leading-7 text-muted">
        Copy the complete <code>dist/</code> build, the application's original{" "}
        <code>package.json</code>, its matching <code>package-lock.json</code>
        and any runtime resources to a deployment directory. Keep the original
        manifest and lockfile at the deployment root, next to <code>dist/</code>.
        Keep Hum's generated <code>dist/package.json</code> in place.
      </p>
      <CodeBlock code={ordinaryOutputExample} language="text" />
      <p class="mt-3 leading-7 text-muted">
        On the server, install production dependencies and start the app from
        the deployment root:
      </p>
      <CodeBlock code={ordinaryInstallExample} language="bash" />
      <p class="mt-3 leading-7 text-muted">
        Keep runtime packages in <code>dependencies</code>. If you use another
        package manager, include its matching lockfile and use its production
        install command. Install native dependencies on the deployment OS and
        architecture. Node resolves dependencies from the root's{" "}
        <code>node_modules</code>; expose only <code>dist/public/</code> as
        static files.
      </p>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        Monorepos with local package dependencies
      </h2>
      <p class="mt-3 leading-7 text-muted">
        Monorepos can use npm, Yarn, pnpm or other build and package management
        tools; Hum does not require a particular one. If all production
        dependencies are registry-installable, the ordinary deployment above
        still applies. Local references such as <code>workspace:</code>,{" "}
        <code>file:</code> or <code>link:</code> need extra handling: deploying
        only the app may leave dependency links pointing to the source checkout.
      </p>
      <p class="mt-3 leading-7 text-muted">
        Build the local packages first. Then either publish/package them for
        the deployment install, or use your tooling to assemble an independent
        directory containing the app and its production dependency graph.
        Include each package's compiled outputs and runtime resources, and
        check that dependency links resolve within the deployment.
      </p>

      <h3 class="mt-8 text-lg font-extrabold tracking-tight">
        Example: pnpm
      </h3>
      <p class="mt-3 leading-7 text-muted">
        For a project using pnpm workspaces, <code>pnpm deploy --prod</code>{" "}
        can assemble that directory without publishing the local packages.
        This example uses the Hum repository's <code>hum-docs</code> app and
        was tested with pnpm 11.20.0.
      </p>
      <p class="mt-3 leading-7 text-muted">
        Merge these settings into the workspace root's{" "}
        <code>pnpm-workspace.yaml</code>. Injection lets deployment copy workspace
        packages instead of linking back to the checkout. Synchronizing after
        each <code>build</code> script refreshes their compiled outputs; use your
        actual build script names if they differ.
      </p>
      <CodeBlock code={workspaceExample} language="yaml" />
      <p class="mt-3 leading-7 text-muted">
        Include <code>dist</code> in the application package's <code>files</code>{" "}
        list, plus any resources it reads at runtime. Each workspace dependency
        must also include its compiled outputs in its own package files.
      </p>
      <CodeBlock code={filesExample} language="json" />
      <p class="mt-3 leading-7 text-muted">
        Keep packages needed at runtime in <code>dependencies</code>; deployment
        with <code>--prod</code> excludes development dependencies. Add a script
        to the workspace root's <code>package.json</code>. This example uses the
        Hum repository's <code>hum-docs</code> package and existing root{" "}
        <code>build</code> script, which builds workspace dependencies before the
        app. Substitute your application's package name and build command.
      </p>
      <CodeBlock code={scriptsExample} language="json" />
      <p class="mt-3 leading-7 text-muted">
        After enabling injection, install once to update the lockfile, then
        build, deploy and start the result. Choose a new or empty destination
        directory for each deployment.
      </p>
      <CodeBlock code={firstDeployExample} language="bash" />
      <p class="mt-3 leading-7 text-muted">
        Commit the updated lockfile. Subsequent CI runs can use the frozen
        lockfile:
      </p>
      <CodeBlock code={ciExample} language="bash" />
      <p class="mt-3 leading-7 text-muted">
        Use the modern deploy implementation with injection enabled. In the
        tested workspace, <code>--legacy</code> left workspace dependency links
        pointing to the source checkout, making that output unsuitable for
        independent deployment.
      </p>

      <h3 class="mt-8 text-lg font-extrabold tracking-tight">
        Run the deployed directory
      </h3>
      <CodeBlock code={outputExample} language="text" />
      <p class="mt-3 leading-7 text-muted">
        Transfer the entire directory, including <code>node_modules</code>, and
        preserve its internal links. The installed dependencies are ready to
        run; no server-side install is needed. The application manifest may
        still contain <code>workspace:</code> specifiers. Build native
        dependencies on the deployment OS and architecture.
      </p>
      <p class="mt-3 leading-7 text-muted">
        Hum's generated <code>dist/package.json</code> only marks ESM and does
        not copy dependencies. Node resolves them from the deployed parent
        directory's <code>node_modules</code>. Set <code>PORT</code> to change
        the example server's default port of <code>3000</code>.
      </p>
      <p class="mt-3 leading-7 text-muted">
        Configure a reverse proxy or static asset service to expose only{" "}
        <code>dist/public/</code>. Server modules, manifests and dependencies
        must remain outside the public HTTP tree.
      </p>
    </article>
  );
}
