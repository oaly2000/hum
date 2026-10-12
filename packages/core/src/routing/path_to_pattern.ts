/**
 * Translates Hum's file system route syntax into Hono path patterns.
 *
 * | file path            | url path          | Hono pattern        |
 * | -------------------- | ----------------- | ------------------- |
 * | `index.tsx`          | `/`               | `/`                 |
 * | `about.tsx`          | `/about`          | `/about`            |
 * | `blog/[id].tsx`      | `/blog/[id]`      | `/blog/:id`         |
 * | `docs/[...slug].ts`  | `/docs/[...slug]` | `/docs/:slug{.*}`   |
 * | `[[id]].tsx`         | `/[[id]]`         | `/` and `/:id`      |
 * | `(marketing)/a.tsx`  | `/(marketing)/a`  | `/a`                |
 *
 * `(group)` segments are transparent: they only affect the directory layout on
 * disk. Optional `[[name]]` segments are expanded into every concrete pattern,
 * because Hono can only omit a trailing optional parameter.
 */

export interface SegmentInfo {
  /** The raw segment, e.g. `[id]`. */
  raw: string;
  kind: "static" | "param" | "wildcard" | "optional" | "mixed";
  /** Parameter names contributed by this segment. */
  params: string[];
  /** Hono path piece for this segment. */
  piece: string;
  /** True when the whole segment can be omitted. */
  omittable: boolean;
}

export interface UrlPatternInfo {
  /** Normalized Hum pattern, e.g. `/blog/:id`. */
  pattern: string;
  /** One or more Hono patterns (optional segments are expanded). */
  honoPatterns: string[];
  /** Parameter names in order of appearance. */
  params: string[];
  /** Processed segments (groups removed). */
  segments: SegmentInfo[];
  /** Number of segments that contain parameters. */
  dynamicCount: number;
  hasWildcard: boolean;
  /** Higher is more specific. Used to order route registration. */
  score: number;
}

const GROUP_SEGMENT = /^\(.*\)$/;
const TOKEN = /\[\[([A-Za-z0-9_]+)\]\]|\[\.\.\.([A-Za-z0-9_]+)\]|\[([A-Za-z0-9_]+)\]/g;

/** A Hono catch-all as produced from `[...slug]`: `:slug{.*}`. */
const HONO_WILDCARD = /^:([A-Za-z0-9_]+)\{\.\*\}$/;
/** A Hono parameter as produced from `[id]`: `:id`. */
const HONO_PARAM = /^:([A-Za-z0-9_]+)$/;

/** True when the segment is a `(group)` directory segment. */
export function isGroupSegment(segment: string): boolean {
  return GROUP_SEGMENT.test(segment);
}

function parseSegment(raw: string): SegmentInfo {
  const params: string[] = [];

  if (GROUP_SEGMENT.test(raw)) {
    return { raw, kind: "static", params, piece: "", omittable: true };
  }

  // Already translated patterns reach this function too (for example when a
  // matcher is compiled for one of the produced Hono patterns), so Hono's own
  // syntax has to round trip unchanged.
  const honoWildcard = HONO_WILDCARD.exec(raw);
  if (honoWildcard !== null) {
    params.push(honoWildcard[1]);
    return { raw, kind: "wildcard", params, piece: raw, omittable: false };
  }
  const honoParam = HONO_PARAM.exec(raw);
  if (honoParam !== null) {
    params.push(honoParam[1]);
    return { raw, kind: "param", params, piece: raw, omittable: false };
  }

  // Rewrite every bracketed token into its Hono equivalent, keeping literal
  // text (e.g. `[id]@[slug]` -> `:id@:slug`).
  let piece = "";
  let cursor = 0;
  let wildcard = false;
  let optionalCount = 0;
  let paramCount = 0;
  let sawLiteral = false;

  TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN.exec(raw)) !== null) {
    const literal = raw.slice(cursor, match.index);
    if (literal.length > 0) {
      piece += literal.replace(/[{}?*:]/g, (c) => `\\${c}`);
      sawLiteral = true;
    }
    cursor = match.index + match[0].length;

    if (match[1] !== undefined) {
      // `[[optional]]`: the whole segment is dropped by `expandOptional`, so
      // the piece itself stays required. Hono can only omit a trailing
      // optional parameter, hence the expansion instead of `:name?`.
      params.push(match[1]);
      piece += `:${match[1]}`;
      optionalCount++;
      paramCount++;
    } else if (match[2] !== undefined) {
      // [...wildcard]
      params.push(match[2]);
      piece += `:${match[2]}{.*}`;
      wildcard = true;
    } else {
      // [param]
      params.push(match[3]);
      piece += `:${match[3]}`;
      paramCount++;
    }
  }

  const tail = raw.slice(cursor);
  if (tail.length > 0) {
    piece += tail.replace(/[{}?*:]/g, (c) => `\\${c}`);
    sawLiteral = true;
  }

  const syntaxSeen = cursor > 0;

  if (!syntaxSeen) {
    return { raw, kind: "static", params, piece: raw, omittable: false };
  }
  if (wildcard && !sawLiteral && raw.startsWith("[...")) {
    return { raw, kind: "wildcard", params, piece, omittable: false };
  }
  if (
    optionalCount === 1 && paramCount === 1 && !sawLiteral &&
    raw.startsWith("[[")
  ) {
    return { raw, kind: "optional", params, piece, omittable: true };
  }
  return {
    raw,
    kind: sawLiteral ? "mixed" : "param",
    params,
    piece,
    omittable: false,
  };
}

const MAX_OPTIONAL_EXPANSION = 4;

/** Parses a Hum url path into a Hono compatible pattern description. */
export function parseUrlPath(urlPath: string): UrlPatternInfo {
  const rawSegments = urlPath.split("/").filter((s) => s.length > 0);
  const segments: SegmentInfo[] = [];
  for (const raw of rawSegments) {
    if (GROUP_SEGMENT.test(raw)) continue;
    segments.push(parseSegment(raw));
  }

  const params: string[] = [];
  let dynamicCount = 0;
  let hasWildcard = false;
  let score = 0;

  for (const seg of segments) {
    for (const p of seg.params) params.push(p);
    if (seg.params.length > 0) dynamicCount++;
    if (seg.kind === "wildcard") {
      hasWildcard = true;
      score += 1;
    } else if (seg.kind === "static") {
      score += 10;
    } else if (seg.kind === "optional") {
      score += 4;
    } else {
      score += 3;
    }
  }

  const optionalIndexes = segments
    .map((seg, i) => (seg.omittable && seg.raw.startsWith("[[") ? i : -1))
    .filter((i) => i >= 0);

  const honoPatterns: string[] =
    optionalIndexes.length > 0 && optionalIndexes.length <= MAX_OPTIONAL_EXPANSION
      ? expandOptional(segments, optionalIndexes)
      : [joinPattern(segments, new Set())];

  const pattern = joinPattern(segments, new Set());

  const specificity = score * 100 + segments.length;
  // A catch-all must be registered last so that its more specific siblings
  // keep priority, no matter how deep it is.
  const total = hasWildcard ? specificity - 100_000 : specificity;

  return {
    pattern: pattern.length === 0 ? "/" : pattern,
    honoPatterns,
    params,
    segments,
    dynamicCount,
    hasWildcard,
    score: total,
  };
}

function joinPattern(segments: SegmentInfo[], omit: Set<number>): string {
  const parts: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (omit.has(i)) continue;
    parts.push(segments[i].piece);
  }
  if (parts.length === 0) return "/";
  return "/" + parts.join("/");
}

function expandOptional(
  segments: SegmentInfo[],
  optionalIndexes: number[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const total = 1 << optionalIndexes.length;
  for (let mask = 0; mask < total; mask++) {
    const omit = new Set<number>();
    for (let i = 0; i < optionalIndexes.length; i++) {
      if (mask & (1 << i)) omit.add(optionalIndexes[i]);
    }
    const pattern = joinPattern(segments, omit);
    if (!seen.has(pattern)) {
      seen.add(pattern);
      out.push(pattern);
    }
  }
  // Most specific first so that `/blog/42` is preferred over `/blog`.
  out.sort((a, b) => b.length - a.length);
  return out;
}

/** The directory segments of a routes-relative path, groups removed. */
export function dirSegments(relDir: string): string[] {
  return relDir
    .split("/")
    .filter((s) => s.length > 0 && !GROUP_SEGMENT.test(s));
}

/** Hum url path of a route file: `blog/[id].tsx` -> `/blog/[id]`. */
export function urlPathOf(relFileNoExt: string, isRouteFile: boolean): string {
  const raw = relFileNoExt.split("/").filter((s) => s.length > 0);
  let base = raw.pop() ?? "";
  const dir = dirSegments(raw.join("/"));

  if (isRouteFile) {
    if (base === "index") base = "";
    const all = base.length > 0 ? [...dir, base] : dir;
    return all.length === 0 ? "/" : "/" + all.join("/");
  }

  return dir.length === 0 ? "/" : "/" + dir.join("/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds the source of a matcher for `info`. With `subpaths` the result also
 * matches every path below `info`.
 */
function matcherSource(info: UrlPatternInfo, subpaths: boolean): string {
  const parts: string[] = [];
  for (const seg of info.segments) {
    if (seg.kind === "static") {
      parts.push("/" + escapeRegExp(seg.piece));
      continue;
    }
    if (seg.kind === "wildcard") {
      // A catch-all also matches requests without any trailing segment.
      const name = seg.params[0];
      parts.push(`(?:/(?<${name}>.*))?`);
      continue;
    }
    if (seg.kind === "optional") {
      const name = seg.params[0];
      parts.push(`(?:/(?<${name}>[^/]+))?`);
      continue;
    }
    if (seg.params.length === 1) {
      const name = seg.params[0];
      parts.push(`/(?<${name}>[^/]+)`);
      continue;
    }
    // Mixed segments such as `[a]@[b]`: build a regex from the pieces.
    let piece = "/";
    let cursor = 0;
    const raw = seg.raw;
    TOKEN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TOKEN.exec(raw)) !== null) {
      piece += escapeRegExp(raw.slice(cursor, match.index));
      cursor = match.index + match[0].length;
      if (match[1] !== undefined) {
        piece += `(?<${match[1]}>[^/]*)?`;
      } else if (match[2] !== undefined) {
        piece += `(?<${match[2]}>.*)`;
      } else {
        piece += `(?<${match[3]}>[^/]+)`;
      }
    }
    piece += escapeRegExp(raw.slice(cursor));
    parts.push(piece);
  }

  if (parts.length === 0) return subpaths ? "^/" : "^/?$";
  return `^${parts.join("")}${subpaths ? "(?:/.*)?" : "/?"}$`;
}

/**
 * Compiles a pattern info into a `RegExp`. Hono does the real request routing;
 * this matcher resolves which `_404` / `_error` page applies to a request.
 */
export function compileMatcher(info: UrlPatternInfo): RegExp {
  return new RegExp(matcherSource(info, false));
}

/**
 * Like {@link compileMatcher}, but also matches every path below `info`. A
 * `_404` page applies to the whole directory below it, not just to the exact
 * directory URL.
 */
export function compilePrefixMatcher(info: UrlPatternInfo): RegExp {
  return new RegExp(matcherSource(info, true));
}
