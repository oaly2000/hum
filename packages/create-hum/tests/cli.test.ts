import { describe, expect, it } from "vitest";

import { parseArgs } from "../src/cli.js";

describe("the command line", () => {
  it("scaffolds from the default template", () => {
    expect(parseArgs(["my-app"])).toEqual({
      kind: "scaffold",
      target: "my-app",
      template: "basic",
    });
  });

  it("reads the template in either form", () => {
    const expected = {
      kind: "scaffold",
      target: "my-app",
      template: "cloudflare",
    };

    expect(parseArgs(["my-app", "--template", "cloudflare"])).toEqual(expected);
    expect(parseArgs(["my-app", "-t", "cloudflare"])).toEqual(expected);
    expect(parseArgs(["--template=cloudflare", "my-app"])).toEqual(expected);
  });

  it("reports arguments it cannot use", () => {
    // Ignoring a misspelled flag would scaffold a project nobody asked for.
    expect(() => parseArgs(["my-app", "--templte", "cloudflare"]))
      .toThrow(/unknown option "--templte"/);
    expect(() => parseArgs(["my-app", "--template"]))
      .toThrow(/needs a template name/);
    expect(() => parseArgs(["my-app", "--template="]))
      .toThrow(/needs a template name/);
    expect(() => parseArgs(["my-app", "--template", "--list"]))
      .toThrow(/needs a template name/);
    expect(() => parseArgs(["my-app", "other"])).toThrow(
      /unexpected argument "other"/,
    );
  });

  it("recognises the commands that scaffold nothing", () => {
    // No arguments is a usage error, so it is told apart from an explicit ask.
    expect(parseArgs([])).toEqual({ kind: "none" });
    expect(parseArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseArgs(["-h"])).toEqual({ kind: "help" });
    expect(parseArgs(["--list"])).toEqual({ kind: "list" });
  });
});
