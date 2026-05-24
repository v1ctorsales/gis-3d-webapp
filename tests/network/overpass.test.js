/**
 * Live network tests against an Overpass endpoint.
 *
 * Opt-in: run via `npm run test:network` (separate vitest config).
 * Override target/AOI with env vars:
 *
 *   OVERPASS_URL=https://my-deploy.vercel.app/api/overpass \
 *   OVERPASS_AOI=grand-canyon \
 *   npm run test:network
 *
 * Each tier is its own `it`, so one slow tier failing doesn't hide that
 * a lighter tier succeeded. A summary table prints at the end.
 *
 * Re-implements `buildWaterQuery` inline rather than importing osm.js so
 * the test is decoupled from Vite's `import.meta.env` plumbing and stays
 * valid even if the source-side helpers move around.
 */
import { describe, it, expect, afterAll } from "vitest";

const DEFAULT_OVERPASS_URL = "https://overpass.private.coffee/api/interpreter";
const TARGET_URL = process.env.OVERPASS_URL || DEFAULT_OVERPASS_URL;

// Predefined AOIs of varying difficulty. The Grand Canyon is the marquee
// stress-test because its dense stream network blows up `waterway=stream`
// responses; the others are calibration points for "easy" and "medium".
const AOIS = {
  "grand-canyon": {
    west: -112.1402,
    south: 36.1413,
    east: -112.0539,
    north: 36.2008,
  },
  "small-nyc": {
    west: -73.99,
    south: 40.74,
    east: -73.98,
    north: 40.75,
  },
  yosemite: {
    west: -119.7,
    south: 37.7,
    east: -119.5,
    north: 37.85,
  },
  manhattan: {
    west: -74.02,
    south: 40.7,
    east: -73.93,
    north: 40.82,
  },
};

const AOI_NAME = process.env.OVERPASS_AOI || "grand-canyon";
const AOI_BBOX = AOIS[AOI_NAME];
if (!AOI_BBOX) {
  throw new Error(
    `Unknown OVERPASS_AOI="${AOI_NAME}". Available: ${Object.keys(AOIS).join(", ")}`,
  );
}

// Tiers mirror the production cascade in src/services/osm.js. Ordered
// lightest → heaviest so the polygons-only test gives a fast signal.
const TIERS = [
  { name: "polygons-only", waterways: [] },
  { name: "rivers-only", waterways: ["river"] },
  { name: "no-stream", waterways: ["river", "canal"] },
  { name: "full", waterways: ["river", "stream", "canal"] },
];

function buildWaterQuery(bbox, waterways) {
  const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const parts = [
    `way["natural"="water"](${b});`,
    `relation["natural"="water"](${b});`,
    `way["waterway"="riverbank"](${b});`,
    `relation["waterway"="riverbank"](${b});`,
    `way["natural"="wetland"](${b});`,
    `relation["natural"="wetland"](${b});`,
  ];
  for (const ww of waterways) {
    parts.push(`way["waterway"="${ww}"](${b});`);
  }
  return `[out:json][timeout:55];(\n${parts.join("\n")}\n);out body;>;out skel qt;`;
}

// Overpass mirrors rate-limit requests without a meaningful User-Agent
// — they respond with "Please include a meaningful User-Agent string"
// instead of running the query. Identify ourselves so the test exercises
// the realistic, non-throttled path.
const USER_AGENT =
  process.env.OVERPASS_USER_AGENT ||
  "gis-3d-webapp-network-tests/1.0 (https://github.com/; orwtullio@gmail.com)";

async function postOverpass(url, query, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = performance.now();
  try {
    // Some proxies (like our Vercel one) accept GET with `q=`; Overpass
    // mirrors only accept POST. POST works for both, so use it uniformly.
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "User-Agent": USER_AGENT,
      },
      body: query,
      signal: ctrl.signal,
    });
    const text = await resp.text();
    const elapsedMs = Math.round(performance.now() - started);
    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        elapsedMs,
        error: text.slice(0, 160),
      };
    }
    let elements = null;
    try {
      const data = JSON.parse(text);
      elements = Array.isArray(data?.elements) ? data.elements.length : null;
    } catch {
      /* not JSON — leave elements null */
    }
    return {
      ok: true,
      status: resp.status,
      elapsedMs,
      bytes: text.length,
      elements,
    };
  } catch (err) {
    const elapsedMs = Math.round(performance.now() - started);
    return {
      ok: false,
      elapsedMs,
      error:
        err.name === "AbortError"
          ? `client timeout after ${timeoutMs}ms`
          : `${err.name || "Error"}: ${err.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];

describe(`Overpass live · ${TARGET_URL} · AOI=${AOI_NAME}`, () => {
  it("probe — server is reachable", async () => {
    const r = await postOverpass(
      TARGET_URL,
      "[out:json][timeout:5];out count;",
      15_000,
    );
    results.push({ test: "probe", queryChars: 36, ...r });
    expect(r.ok, `probe failed: ${r.error}`).toBe(true);
  }, 30_000);

  for (const tier of TIERS) {
    it(`tier="${tier.name}" responds within 60 s`, async () => {
      const q = buildWaterQuery(AOI_BBOX, tier.waterways);
      const r = await postOverpass(TARGET_URL, q, 60_000);
      results.push({ test: tier.name, queryChars: q.length, ...r });
      expect(
        r.ok,
        `tier "${tier.name}" failed: ${r.error ?? `HTTP ${r.status}`}`,
      ).toBe(true);
    }, 90_000);
  }

  afterAll(() => {
    if (results.length === 0) return;
    console.log(`\nSummary · target=${TARGET_URL} · AOI=${AOI_NAME}`);
    console.table(
      results.map((r) => ({
        test: r.test,
        ok: r.ok,
        status: r.status ?? "—",
        elapsedMs: r.elapsedMs,
        queryChars: r.queryChars ?? "—",
        bytes: r.bytes ?? "—",
        elements: r.elements ?? "—",
        error: r.error ? r.error.slice(0, 90) : "",
      })),
    );
  });
});
