const OVERPASS_URL =
  import.meta.env.VITE_OVERPASS_URL ||
  (import.meta.env.PROD
    ? "/api/overpass"
    : "https://overpass.private.coffee/api/interpreter");

const TIMEOUT_MS = 60000;

/**
 * Raw Overpass request. Returns parsed JSON; throws on non-2xx or abort.
 * `meta` lets a caller pass through context for logging.
 */
export async function overpassFetch(query, meta = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const label = meta.label ? `[osm/${meta.label}]` : "[osm]";
  const startedAt = performance.now();

  try {
    let resp;
    if (OVERPASS_URL.startsWith("/")) {
      // Proxy próprio: usa GET para o Vercel cachear no edge
      const url = `${OVERPASS_URL}?q=${encodeURIComponent(query)}`;
      console.log(`${label} GET ${OVERPASS_URL} (${query.length} chars)`);
      resp = await fetch(url, { signal: ctrl.signal });
    } else {
      console.log(`${label} POST ${OVERPASS_URL} (${query.length} chars)`);
      resp = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: query,
        signal: ctrl.signal,
      });
    }
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      const elapsed = Math.round(performance.now() - startedAt);
      console.warn(
        `${label} ✗ HTTP ${resp.status} after ${elapsed}ms`,
        errText.slice(0, 200),
      );
      throw new OverpassHttpError(resp.status, resp.statusText, elapsed);
    }
    // Read once as text to measure size, then parse.
    const text = await resp.text();
    const elapsed = Math.round(performance.now() - startedAt);
    const sizeKb = Math.round(text.length / 1024);
    console.log(`${label} ✓ ${resp.status} · ${sizeKb} kB · ${elapsed}ms`);
    return JSON.parse(text);
  } catch (err) {
    if (err.name === "AbortError") {
      const elapsed = Math.round(performance.now() - startedAt);
      console.warn(`${label} ✗ client timeout after ${elapsed}ms (${TIMEOUT_MS}ms cap)`);
      throw new OverpassTimeoutError(elapsed);
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

class OverpassHttpError extends Error {
  constructor(status, statusText, elapsedMs) {
    super(`Overpass ${status}: ${statusText}`);
    this.status = status;
    this.statusText = statusText;
    this.elapsedMs = elapsedMs;
    this.name = "OverpassHttpError";
  }
}

class OverpassTimeoutError extends Error {
  constructor(elapsedMs) {
    super(`Overpass client timeout after ${elapsedMs}ms`);
    this.elapsedMs = elapsedMs;
    this.name = "OverpassTimeoutError";
  }
}

// Retryable from a server-overload perspective: gateway timeouts, server
// errors, the JS-side timeout, and Overpass's own 429 rate-limiting.
function isRetryableOverpassError(err) {
  if (err instanceof OverpassTimeoutError) return true;
  if (err instanceof OverpassHttpError) {
    return (
      err.status === 504 ||
      err.status === 502 ||
      err.status === 503 ||
      err.status === 429
    );
  }
  return false;
}

function indexNodes(elements) {
  const map = new Map();
  for (const el of elements) {
    if (el.type === "node") map.set(el.id, { lat: el.lat, lon: el.lon });
  }
  return map;
}

function wayCoords(way, nodes) {
  return way.nodes.map((id) => nodes.get(id)).filter(Boolean);
}

function parseHeight(tags) {
  const candidates = ["height", "building:height"];
  for (const k of candidates) {
    if (tags[k]) {
      const v = parseFloat(tags[k]);
      if (Number.isFinite(v)) return v;
    }
  }
  if (tags["building:levels"]) {
    const lvl = parseFloat(tags["building:levels"]);
    if (Number.isFinite(lvl)) return lvl * 3;
  }
  return 6;
}

export async function fetchBuildings(bbox) {
  const q = `
    [out:json][timeout:30];
    way["building"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    out body;
    >;
    out skel qt;
  `;
  const data = await overpassFetch(q);
  const nodes = indexNodes(data.elements);

  const buildings = [];
  for (const el of data.elements) {
    if (el.type !== "way" || !el.tags?.building) continue;
    const coords = wayCoords(el, nodes);
    if (coords.length < 3) continue;
    buildings.push({
      id: el.id,
      coords,
      height: parseHeight(el.tags),
    });
  }
  return buildings;
}

// Linestring waterways we render as buffered ribbons. `ditch` is intentionally
// omitted — at AOI scales (tens of km) it's almost always rendering noise and
// also fattens the Overpass response significantly in rural areas.
const LINESTRING_WATERWAYS = new Set(["river", "stream", "canal"]);
const WATERWAY_DEFAULT_WIDTH_M = {
  river: 30,
  canal: 10,
  stream: 5,
};

// Tiers ordered most-detailed → least. On 504/timeout/etc. we fall to the
// next. Pruning order goes "smallest first" so the heaviest items
// (waterway=stream — thousands of gullies in mountainous terrain) drop
// before users lose meaningful features like the Colorado River.
const WATER_TIERS = [
  {
    name: "full",
    waterways: ["river", "stream", "canal"],
    description: "rivers, streams, canals, lakes, wetlands",
  },
  {
    name: "no-stream",
    waterways: ["river", "canal"],
    description: "rivers, canals, lakes, wetlands (streams dropped — heavy AOI)",
  },
  {
    name: "rivers-only",
    waterways: ["river"],
    description: "rivers, lakes, wetlands (only major waterways)",
  },
  {
    name: "polygons-only",
    waterways: [],
    description: "lakes and wetlands only (no linestrings)",
  },
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
  return `
    [out:json][timeout:55];
    (
${parts.map((p) => `      ${p}`).join("\n")}
    );
    out body;
    >;
    out skel qt;
  `;
}

function summarizeElements(elements) {
  const counts = { node: 0, way: 0, relation: 0 };
  const waterwayCounts = {};
  const naturalCounts = {};
  for (const el of elements) {
    counts[el.type] = (counts[el.type] || 0) + 1;
    if (el.tags?.waterway) {
      waterwayCounts[el.tags.waterway] =
        (waterwayCounts[el.tags.waterway] || 0) + 1;
    }
    if (el.tags?.natural) {
      naturalCounts[el.tags.natural] =
        (naturalCounts[el.tags.natural] || 0) + 1;
    }
  }
  return {
    total: elements.length,
    ...counts,
    waterway: waterwayCounts,
    natural: naturalCounts,
  };
}

export async function fetchWater(bbox) {
  console.group(
    `[osm/water] fetchWater bbox=${bbox.west.toFixed(4)},${bbox.south.toFixed(4)} → ${bbox.east.toFixed(4)},${bbox.north.toFixed(4)}`,
  );
  const overallStart = performance.now();
  try {
    for (let i = 0; i < WATER_TIERS.length; i++) {
      const tier = WATER_TIERS[i];
      console.log(
        `[osm/water] tier ${i + 1}/${WATER_TIERS.length}: "${tier.name}" — ${tier.description}`,
      );
      try {
        const query = buildWaterQuery(bbox, tier.waterways);
        const data = await overpassFetch(query, { label: `water:${tier.name}` });
        const summary = summarizeElements(data.elements || []);
        console.log(`[osm/water] response summary:`, summary);

        const parsed = parseWater(data);
        console.log(
          `[osm/water] parsed: ${parsed.polygons.length} polygon(s)` +
            ` (${parsed.polygons.filter((p) => p.kind === "water").length} water,` +
            ` ${parsed.polygons.filter((p) => p.kind === "wetland").length} wetland)` +
            ` · ${parsed.lines.length} linestring(s)`,
        );

        const lineByType = {};
        for (const l of parsed.lines) {
          lineByType[l.waterway] = (lineByType[l.waterway] || 0) + 1;
        }
        if (parsed.lines.length > 0) {
          console.log(`[osm/water] linestring breakdown:`, lineByType);
        }

        const totalMs = Math.round(performance.now() - overallStart);
        console.log(
          `[osm/water] ✓ tier "${tier.name}" succeeded in ${totalMs}ms`,
        );
        return { ...parsed, tier: tier.name, tierDescription: tier.description };
      } catch (err) {
        const isLast = i === WATER_TIERS.length - 1;
        if (isRetryableOverpassError(err) && !isLast) {
          console.warn(
            `[osm/water] ✗ tier "${tier.name}" failed (${err.name}: ${err.message}) — falling back`,
          );
          continue;
        }
        console.error(`[osm/water] ✗ tier "${tier.name}" gave up:`, err);
        throw err;
      }
    }
    // unreachable — the loop either returns or throws above
    throw new Error("All water tiers exhausted");
  } finally {
    console.groupEnd();
  }
}

function isPolygonWaterTags(tags) {
  return (
    tags?.natural === "water" ||
    tags?.natural === "wetland" ||
    tags?.waterway === "riverbank"
  );
}

function waterKindForTags(tags) {
  if (tags?.natural === "wetland") return "wetland";
  return "water";
}

function parseWaterwayWidth(tags) {
  if (tags?.width) {
    const v = parseFloat(tags.width);
    if (Number.isFinite(v) && v > 0) return v;
  }
  const ww = tags?.waterway;
  return WATERWAY_DEFAULT_WIDTH_M[ww] ?? 5;
}

function indexWays(elements) {
  const map = new Map();
  for (const el of elements) {
    if (el.type === "way") map.set(el.id, el);
  }
  return map;
}

/**
 * Stitch an arbitrary set of OSM ways into closed rings by matching shared
 * endpoint node IDs. Returns rings as arrays of {lat, lon}.
 */
function stitchWayRings(ways, nodes) {
  const segments = ways.map((w) => [...w.nodes]);
  const rings = [];

  while (segments.length > 0) {
    const current = segments.shift();

    let progress = true;
    while (
      progress &&
      current.length >= 2 &&
      current[0] !== current[current.length - 1]
    ) {
      progress = false;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const first = current[0];
        const last = current[current.length - 1];
        const sFirst = seg[0];
        const sLast = seg[seg.length - 1];

        if (last === sFirst) {
          for (let j = 1; j < seg.length; j++) current.push(seg[j]);
        } else if (last === sLast) {
          for (let j = seg.length - 2; j >= 0; j--) current.push(seg[j]);
        } else if (first === sLast) {
          for (let j = seg.length - 2; j >= 0; j--) current.unshift(seg[j]);
        } else if (first === sFirst) {
          for (let j = 1; j < seg.length; j++) current.unshift(seg[j]);
        } else {
          continue;
        }

        segments.splice(i, 1);
        progress = true;
        break;
      }
    }

    if (current[0] === current[current.length - 1] && current.length >= 4) {
      const ring = current.map((id) => nodes.get(id)).filter(Boolean);
      if (ring.length >= 3) rings.push(ring);
    }
  }

  return rings;
}

function parseWater(osmData) {
  const nodes = indexNodes(osmData.elements);
  const ways = indexWays(osmData.elements);

  // Track ways already consumed by water multipolygons so they don't get
  // rendered twice (once via the relation, once as a standalone way).
  const consumed = new Set();
  for (const el of osmData.elements) {
    if (el.type !== "relation") continue;
    if (el.tags?.type !== "multipolygon") continue;
    if (!isPolygonWaterTags(el.tags)) continue;
    for (const m of el.members || []) {
      if (m.type === "way") consumed.add(m.ref);
    }
  }

  const polygons = [];
  const lines = [];

  // Standalone water ways (lakes, pools, ponds, wetlands — anything mapped
  // as a single closed way with the water tag on the way itself)
  for (const el of osmData.elements) {
    if (el.type !== "way") continue;
    if (!isPolygonWaterTags(el.tags)) continue;
    if (consumed.has(el.id)) continue;
    const coords = wayCoords(el, nodes);
    if (coords.length < 3) continue;
    polygons.push({
      id: el.id,
      coords,
      holes: [],
      kind: waterKindForTags(el.tags),
    });
  }

  // Multipolygon relations (rivers, large lakes with islands, complex shapes)
  for (const el of osmData.elements) {
    if (el.type !== "relation") continue;
    if (el.tags?.type !== "multipolygon") continue;
    if (!isPolygonWaterTags(el.tags)) continue;

    const outerWays = [];
    const innerWays = [];
    for (const m of el.members || []) {
      if (m.type !== "way") continue;
      const w = ways.get(m.ref);
      if (!w) continue;
      if (m.role === "outer" || m.role === "") outerWays.push(w);
      else if (m.role === "inner") innerWays.push(w);
    }

    const outerRings = stitchWayRings(outerWays, nodes);
    const innerRings = stitchWayRings(innerWays, nodes);

    // Approximation: attach all holes to the first outer ring. Geometrically
    // correct for the vast majority of water bodies (one outer ring + islands).
    const kind = waterKindForTags(el.tags);
    for (let i = 0; i < outerRings.length; i++) {
      polygons.push({
        id: `${el.id}-${i}`,
        coords: outerRings[i],
        holes: i === 0 ? innerRings : [],
        kind,
      });
    }
  }

  // Linestring waterways (rivers, streams, canals, ditches) — buffered into
  // ribbon polygons later by the geometry builder.
  for (const el of osmData.elements) {
    if (el.type !== "way") continue;
    const ww = el.tags?.waterway;
    if (!ww || !LINESTRING_WATERWAYS.has(ww)) continue;
    // Skip ways that are also part of a riverbank polygon (rare but possible).
    if (el.tags?.area === "yes") continue;
    const coords = wayCoords(el, nodes);
    if (coords.length < 2) continue;
    lines.push({
      id: el.id,
      coords,
      waterway: ww,
      width: parseWaterwayWidth(el.tags),
    });
  }

  return { polygons, lines };
}

export async function fetchRoads(bbox) {
  const { south, west, north, east } = bbox;
  const query = `
    [out:json][timeout:25];
    (
      way["highway"]
        ["highway"!~"^(steps|elevator|construction|proposed|raceway)$"]
        (${south},${west},${north},${east});
    );
    out body;
    >;
    out skel qt;
  `.trim();

  const data = await overpassFetch(query);
  return parseRoads(data);
}

function parseRoads(data) {
  const nodes = new Map();
  for (const el of data.elements) {
    if (el.type === "node") nodes.set(el.id, [el.lon, el.lat]);
  }

  const roads = [];
  for (const el of data.elements) {
    if (el.type !== "way" || !el.tags?.highway) continue;
    const coords = el.nodes.map((id) => nodes.get(id)).filter(Boolean);
    if (coords.length < 2) continue;
    roads.push({
      type: el.tags.highway,
      name: el.tags.name,
      tunnel: el.tags.tunnel === "yes",
      bridge: el.tags.bridge === "yes",
      coords,
    });
  }
  return roads;
}
