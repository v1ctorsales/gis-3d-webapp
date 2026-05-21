const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

async function overpassFetch(query, { timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Overpass error ${response.status}`);
    }
    return await response.json();
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error("Overpass timed out — try a smaller area or retry");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
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

export async function fetchWater(bbox) {
  const q = `
    [out:json][timeout:30];
    (
      way["natural"="water"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["waterway"="riverbank"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      relation["natural"="water"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      relation["waterway"="riverbank"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    );
    out body;
    >;
    out skel qt;
  `;
  const data = await overpassFetch(q);
  return parseWater(data);
}

function isWaterTags(tags) {
  return tags?.natural === "water" || tags?.waterway === "riverbank";
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
    if (!isWaterTags(el.tags)) continue;
    for (const m of el.members || []) {
      if (m.type === "way") consumed.add(m.ref);
    }
  }

  const polygons = [];

  // Standalone water ways (lakes, pools, ponds — anything mapped as a
  // single closed way with the water tag on the way itself)
  for (const el of osmData.elements) {
    if (el.type !== "way") continue;
    if (!isWaterTags(el.tags)) continue;
    if (consumed.has(el.id)) continue;
    const coords = wayCoords(el, nodes);
    if (coords.length < 3) continue;
    polygons.push({ id: el.id, coords, holes: [] });
  }

  // Multipolygon relations (rivers, large lakes with islands, complex shapes)
  for (const el of osmData.elements) {
    if (el.type !== "relation") continue;
    if (el.tags?.type !== "multipolygon") continue;
    if (!isWaterTags(el.tags)) continue;

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
    for (let i = 0; i < outerRings.length; i++) {
      polygons.push({
        id: `${el.id}-${i}`,
        coords: outerRings[i],
        holes: i === 0 ? innerRings : [],
      });
    }
  }

  return polygons;
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
