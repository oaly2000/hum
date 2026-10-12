import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { crawlProject } from "../src/discovery/fs_crawl.js";

describe("crawlProject", () => {
  it("does not treat route-local _components directories as routes", async () => {
    const root = await mkdtemp(join(tmpdir(), "hum-routes-"));
    const files = [
      "routes/index.tsx",
      "routes/blog/index.tsx",
      "routes/blog/_components/Card.tsx",
      "routes/blog/_islands/Editor.tsx",
      "routes/admin/_islands/Chart.tsx",
      "routes/_components/Shared.tsx",
      "islands/_components/Control.tsx",
    ];

    try {
      for (const file of files) {
        const path = join(root, file);
        await mkdir(join(path, ".."), { recursive: true });
        await writeFile(path, "export default function Component() {}");
      }

      const project = await crawlProject({ root });

      expect(project.routes.map((route) => route.file)).toEqual([
        "routes/blog/index.tsx",
        "routes/index.tsx",
      ]);
      expect(project.islands.map((island) => island.file)).toEqual([
        "islands/_components/Control.tsx",
        "routes/admin/_islands/Chart.tsx",
        "routes/blog/_islands/Editor.tsx",
      ]);
      expect(project.islands.map((island) => island.name)).toEqual([
        "_components_Control",
        "local_admin__islands_Chart",
        "local_blog__islands_Editor",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
