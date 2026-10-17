import { describe, expect, it } from "vitest";

import {
  compileMatcher,
  parseUrlPath,
  urlPathOf,
} from "../src/routing/path_to_pattern.js";

describe("parseUrlPath", () => {
  it("keeps static paths untouched", () => {
    const info = parseUrlPath("/blog/about");
    expect(info.honoPatterns).toEqual(["/blog/about"]);
    expect(info.params).toEqual([]);
    expect(info.pattern).toBe("/blog/about");
  });

  it("maps dynamic segments to Hono parameters", () => {
    const info = parseUrlPath("/blog/[id]");
    expect(info.honoPatterns).toEqual(["/blog/:id"]);
    expect(info.params).toEqual(["id"]);
    expect(info.dynamicCount).toBe(1);
  });

  it("maps catch all segments to a regex wildcard", () => {
    const info = parseUrlPath("/docs/[...slug]");
    expect(info.honoPatterns).toEqual(["/docs/:slug{.*}"]);
    expect(info.hasWildcard).toBe(true);
  });

  it("expands optional segments into concrete patterns", () => {
    expect(parseUrlPath("/[[id]]").honoPatterns).toEqual(["/:id", "/"]);
    expect(parseUrlPath("/[[lang]]/about").honoPatterns).toEqual([
      "/:lang/about",
      "/about",
    ]);
  });

  it("removes group segments", () => {
    const info = parseUrlPath("/(marketing)/about");
    expect(info.honoPatterns).toEqual(["/about"]);
  });

  it("supports multiple parameters in one segment", () => {
    const info = parseUrlPath("/[first]@[second]");
    expect(info.params).toEqual(["first", "second"]);
    expect(info.honoPatterns).toEqual(["/:first@:second"]);
  });

  it("scores static segments above dynamic ones", () => {
    expect(parseUrlPath("/blog/about").score).toBeGreaterThan(
      parseUrlPath("/blog/:id").score,
    );
    expect(parseUrlPath("/blog/:id").score).toBeGreaterThan(
      parseUrlPath("/blog/:rest{.*}").score,
    );
  });
});

describe("compileMatcher", () => {
  it("matches dynamic routes", () => {
    const re = compileMatcher(parseUrlPath("/blog/[id]"));
    expect(re.test("/blog/42")).toBe(true);
    expect(re.test("/blog/42/comments")).toBe(false);
    expect(re.test("/blog")).toBe(false);
  });

  it("matches optional routes with and without the segment", () => {
    const re = compileMatcher(parseUrlPath("/[[id]]/page"));
    expect(re.test("/page")).toBe(true);
    expect(re.test("/42/page")).toBe(true);
    expect(re.test("/42/43/page")).toBe(false);
  });

  it("matches catch all routes", () => {
    const re = compileMatcher(parseUrlPath("/docs/[...slug]"));
    expect(re.test("/docs/a/b/c")).toBe(true);
    expect(re.test("/docs")).toBe(true);
    expect(re.test("/other/a")).toBe(false);
  });

  it("extracts parameters", () => {
    const re = compileMatcher(parseUrlPath("/blog/[id]/[comment]"));
    const match = re.exec("/blog/42/7");
    expect(match?.groups).toMatchObject({ id: "42", comment: "7" });
  });

  it("keeps the literal prefix and suffix of a mixed parameter segment", () => {
    const re = compileMatcher(parseUrlPath("/posts/post-[id].html"));
    expect(re.exec("/posts/post-42.html")?.groups).toMatchObject({ id: "42" });
    expect(re.test("/posts/42")).toBe(false);
  });
});

describe("urlPathOf", () => {
  it("turns index files into the directory route", () => {
    expect(urlPathOf("blog/index", true)).toBe("/blog");
    expect(urlPathOf("index", true)).toBe("/");
  });

  it("keeps route syntax", () => {
    expect(urlPathOf("blog/[id]", true)).toBe("/blog/[id]");
    expect(urlPathOf("docs/[...slug]", true)).toBe("/docs/[...slug]");
  });

  it("uses the directory for special files", () => {
    expect(urlPathOf("blog/_layout", false)).toBe("/blog");
    expect(urlPathOf("_app", false)).toBe("/");
  });

  it("omits group segments from the url", () => {
    expect(urlPathOf("(marketing)/about", true)).toBe("/about");
    expect(urlPathOf("(marketing)/_layout", false)).toBe("/");
  });
});
