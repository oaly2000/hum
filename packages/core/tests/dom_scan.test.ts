// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Fragment, h } from "preact";
import type { AnyVNode } from "../src/shared/preact.js";
import { ISLAND_REGISTRY } from "../src/runtime/registry.js";
import {
  createReviveCtx,
  createRootFragment,
  FacetKind,
  domToVNode,
  Marker,
  planFacets,
  walkInner,
} from "../src/runtime/dom.js";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  ISLAND_REGISTRY.delete("scanner");
});

it("restores slots inside discarded island markup and resumes adoption after the island", () => {
  const Island = () => null;
  ISLAND_REGISTRY.set("scanner", Island);
  document.body.innerHTML = `<!--hum:island:scanner:0:-->
    <section class="rendered-by-island"><p>server markup</p>
      <!--hum:slot:1:children--><button data-hum-key="slot-key" disabled
        data-hum-handler='{"onClick":1}'>slot</button><!--/hum:slot-->
    </section><!--/hum:island--><input type="checkbox" checked data-hum-key="after">`;
  const button = document.querySelector("button")!;
  const handler = vi.fn();
  const root: AnyVNode = h(Fragment, null);
  domToVNode([{ props: {} }, { handler }], [root], [Marker.Partial], document.body.firstChild!, null);
  const children = (root.props.children as Array<AnyVNode | string>)
    .filter((child): child is AnyVNode => typeof child !== "string");
  const [island, input] = children;
  expect(island.type).toBe(Island);
  const slot = island.props.children as AnyVNode;
  const adopted = (slot.props.children as AnyVNode[])[0];
  expect(adopted.type).toBe("button");
  expect(adopted.key).toBe("slot-key");
  expect(adopted.props.disabled).toBe(true);
  expect(adopted.props.onClick).toBe(handler);
  expect(input.type).toBe("input");
  expect(input.key).toBe("after");
  expect(input.props.checked).toBe(true);
  expect(document.querySelector("button")).toBe(button);
});

describe("DOM ownership discovery", () => {
  it("keeps adjacent markers, outer hosts and independent signals in their own boundaries", () => {
    document.body.innerHTML = `
      <p><!--hum:signal:0-->outside<!--/hum:signal--></p>
      <section id="host" data-hum-handler="{}">
        <div id="nested" data-hum-handler="{}">
          <!--hum:partial:hosted:0:-->
          <p><!--hum:signal:1-->inside<!--/hum:signal--></p>
          <!--hum:partial:nested:0:--><!--/hum:partial-->
          <!--/hum:partial-->
        </div>
      </section>
      <!--hum:partial:independent:0:--><!--/hum:partial-->
    `;
    const host = document.querySelector("#host")!;
    const nested = document.querySelector("#nested")!;
    const ctx = createReviveCtx();
    walkInner(ctx, document.body);
    const facets = planFacets(ctx);
    expect(facets.map(facet => facet.kind)).toEqual([FacetKind.Element, FacetKind.Signal]);
    const element = facets[0];
    expect(element.kind === FacetKind.Element && element.el).toBe(host);
    expect(element.kind === FacetKind.Element && element.delegates).toEqual(["partial:hosted"]);
    expect(ctx.roots.map(root => root.name)).toEqual(["independent"]);
    expect(ctx.roots[0].end).not.toBeNull();
    const signal = facets[1];
    expect(signal.kind === FacetKind.Signal && signal.idx).toBe(0);
    expect(signal.kind === FacetKind.Signal && signal.end).not.toBeNull();
    expect(document.querySelector("#nested")).toBe(nested);
  });

  it("reports a hosted root whose closing marker was reparented outside its host", () => {
    document.body.innerHTML = `<section data-hum-handler="{}">
      <!--hum:partial:broken:0:--></section><!--/hum:partial-->`;
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx = createReviveCtx();
    walkInner(ctx, document.body);
    const facets = planFacets(ctx);
    expect(ctx.roots).toEqual([]);
    expect(facets).toHaveLength(1);
    expect(report).toHaveBeenCalledOnce();
    expect(report.mock.calls[0][0]).toMatch(/partial "broken" has invalid HTML nesting/);
  });
});

it("checks range containment against current siblings without crossing either marker", () => {
  document.body.innerHTML = `<i id="before"></i><!--start-->
    <div id="inside"><b id="descendant"></b></div><!--end--><i id="after"></i>`;
  const before = document.querySelector("#before")!;
  const inside = document.querySelector("#inside")!;
  const descendant = document.querySelector("#descendant")!;
  const after = document.querySelector("#after")!;
  const start = before.nextSibling as Comment;
  const end = inside.nextSibling as Comment;
  const range = createRootFragment(document.body, start, end);
  expect(range.contains(inside)).toBe(true);
  expect(range.contains(descendant)).toBe(true);
  for (const node of [before, after, start, end, null]) {
    expect(range.contains(node)).toBe(false);
  }
  document.body.append(inside);
  expect(range.contains(inside)).toBe(false);
  document.body.insertBefore(after, end);
  expect(range.contains(after)).toBe(true);
});
