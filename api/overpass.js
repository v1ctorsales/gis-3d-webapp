export const config = { runtime: "edge" };

const MIRRORS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

const TIMEOUT_PER_MIRROR = 20000;

async function tryMirror(url, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_PER_MIRROR);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`${url} → ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req) {
  const url = new URL(req.url);
  let query;

  if (req.method === "GET") {
    query = url.searchParams.get("q");
  } else if (req.method === "POST") {
    query = await req.text();
  } else {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!query) {
    return new Response("Missing query", { status: 400 });
  }

  const body = `data=${encodeURIComponent(query)}`;
  const errors = [];

  for (const mirror of MIRRORS) {
    try {
      const data = await tryMirror(mirror, body);
      return new Response(data, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control":
            "public, s-maxage=604800, stale-while-revalidate=2592000",
        },
      });
    } catch (err) {
      errors.push(err.message);
    }
  }

  return new Response(
    JSON.stringify({ error: "All Overpass mirrors failed", details: errors }),
    { status: 502, headers: { "Content-Type": "application/json" } },
  );
}
