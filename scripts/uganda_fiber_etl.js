#!/usr/bin/env node

/*
  Uganda Telecom Fiber ETL Script
  - Queries Overpass API for telecom fiber features within Uganda
  - Retries with exponential backoff and rotates between multiple Overpass endpoints
  - Caches raw responses in data/raw
  - Normalizes to GeoJSON and writes to public/data/fiber.geojson
  - Embeds metadata including query and assumptions
*/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

const RAW_DIR = path.resolve(__dirname, '..', 'data', 'raw');
const OUTPUT_DIR = path.resolve(__dirname, '..', 'public', 'data');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'fiber.geojson');

// Build Overpass QL query to capture fiber optic lines and telecom-related nodes
const OVERPASS_QUERY = `
[out:json][timeout:180];
area["name"="Uganda"]["boundary"="administrative"]["admin_level"="2"]->.searchArea;
(
  // Fiber optic cables (lines)
  way["cable"="telecom"]["cable:medium"~"(?i)fibre|fiber"](area.searchArea);
  relation["cable"="telecom"]["cable:medium"~"(?i)fibre|fiber"](area.searchArea);
  way["communication:line"]["communication:medium"~"(?i)fibre|fiber"](area.searchArea);
  relation["communication:line"]["communication:medium"~"(?i)fibre|fiber"](area.searchArea);

  // Telecom points of presence
  node["telecom"~"^(exchange|distribution_point|data_center)$"](area.searchArea);
  node["man_made"="street_cabinet"]["telecom"](area.searchArea);
  node["man_made"="utility_pole"]["utility"="telecom"](area.searchArea);
);
out body geom qt;`;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowISO() {
  return new Date().toISOString();
}

function hash(str) {
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 12);
}

async function postJSONWithRetry(endpoints, bodyText, { maxAttempts = 6, baseDelayMs = 1000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const endpoint = endpoints[(attempt - 1) % endpoints.length];
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: new URLSearchParams({ data: bodyText }),
      });

      if (!res.ok) {
        const text = await res.text();
        const err = new Error(`Overpass HTTP ${res.status}: ${res.statusText} - ${text.slice(0, 200)}`);
        err.status = res.status;
        throw err;
      }

      const json = await res.json();

      if (json && typeof json === 'object' && json.remark) {
        const err = new Error(`Overpass remark: ${json.remark}`);
        throw err;
      }

      return json;
    } catch (err) {
      lastError = err;
      const delay = Math.round(baseDelayMs * Math.pow(2, attempt - 1) * (0.7 + Math.random() * 0.6));
      if (attempt < maxAttempts) {
        console.warn(
          `[${nowISO()}] Attempt ${attempt} failed against ${endpoint}: ${err.message}. Retrying in ${delay}ms...`
        );
        await sleep(delay);
      } else {
        console.error(`[${nowISO()}] Final attempt failed: ${err.message}`);
      }
    }
  }
  throw lastError || new Error('Overpass query failed');
}

function elementToGeoJSONFeature(el) {
  const tags = el.tags || {};
  const commonProps = {
    osm_id: el.id,
    osm_type: el.type, // node | way | relation
    name: tags.name || tags.ref || null,
    operator: tags.operator || null,
    owner: tags.owner || null,
    telecom: tags.telecom || null,
    cable_medium: tags['cable:medium'] || null,
    communication_medium: tags['communication:medium'] || null,
    source: 'OpenStreetMap',
    licence: 'ODbL-1.0',
    attribution: '© OpenStreetMap contributors',
  };

  // Determine feature type classification
  let featureType = null;
  if (['way', 'relation'].includes(el.type)) {
    if (
      (tags.cable === 'telecom' && /fibre|fiber/i.test(tags['cable:medium'] || '')) ||
      (tags['communication:line'] && /fibre|fiber/i.test(tags['communication:medium'] || ''))
    ) {
      featureType = 'fiber_line';
    }
  }
  if (el.type === 'node') {
    if (/^(exchange|distribution_point|data_center)$/i.test(tags.telecom || '')) featureType = 'telecom_site';
    else if (tags.man_made === 'street_cabinet' && tags.telecom) featureType = 'telecom_cabinet';
    else if (tags.man_made === 'utility_pole' && tags.utility === 'telecom') featureType = 'telecom_pole';
  }

  // Build geometry
  let geometry = null;
  if (el.type === 'node' && typeof el.lon === 'number' && typeof el.lat === 'number') {
    geometry = { type: 'Point', coordinates: [el.lon, el.lat] };
  } else if (el.type === 'way' && Array.isArray(el.geometry)) {
    const coords = el.geometry.map((p) => [p.lon, p.lat]);
    geometry = { type: 'LineString', coordinates: coords };
  } else if (el.type === 'relation' && Array.isArray(el.members)) {
    // Attempt to construct a MultiLineString from member ways
    const lines = [];
    for (const m of el.members) {
      if (m.type === 'way' && Array.isArray(m.geometry)) {
        lines.push(m.geometry.map((p) => [p.lon, p.lat]));
      }
    }
    if (lines.length > 0) {
      geometry = lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines };
    }
  }

  if (!geometry) return null; // skip if no geometry

  return {
    type: 'Feature',
    id: `${el.type}/${el.id}`,
    geometry,
    properties: { ...commonProps, feature_type: featureType, tags },
  };
}

function buildFeatureCollection(elements, meta) {
  const features = [];
  for (const el of elements) {
    const f = elementToGeoJSONFeature(el);
    if (f) features.push(f);
  }

  return {
    type: 'FeatureCollection',
    name: 'uganda_telecom_fiber',
    features,
    metadata: meta,
  };
}

async function main() {
  ensureDir(RAW_DIR);
  ensureDir(OUTPUT_DIR);

  console.log(`[${nowISO()}] Starting Overpass query for Uganda telecom fiber features...`);

  const start = Date.now();
  const json = await postJSONWithRetry(OVERPASS_ENDPOINTS, OVERPASS_QUERY, { maxAttempts: 6, baseDelayMs: 1500 });
  const durationMs = Date.now() - start;

  // Cache raw response
  const shortHash = hash(OVERPASS_QUERY);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const rawPath = path.join(RAW_DIR, `uganda-fiber-${ts}-${shortHash}.json`);
  fs.writeFileSync(rawPath, JSON.stringify(json, null, 2));

  const meta = {
    generated_at: nowISO(),
    duration_ms: durationMs,
    query: OVERPASS_QUERY,
    source: 'Overpass API',
    endpoints: OVERPASS_ENDPOINTS,
    description:
      'Telecom fiber ETL for Uganda. Includes ways/relations tagged as cable=telecom with cable:medium=fibre/fiber or communication:line with communication:medium=fibre/fiber, and telecom nodes such as exchanges and distribution points.',
    assumptions: [
      'Fiber optic lines are tagged either as cable=telecom + cable:medium=fibre/fiber or communication:line + communication:medium=fibre/fiber in OSM.',
      'Telecom points of presence are represented by nodes with telecom=exchange|distribution_point|data_center, street cabinets with man_made=street_cabinet + telecom=*, and poles with man_made=utility_pole + utility=telecom.',
      'Not all real-world fiber may be mapped; coverage depends on OSM contributions.',
      'Geometry for ways/relations is derived using out geom; relations are simplified to (Multi)LineString by concatenating member way geometries.',
    ],
    licence: 'Open Database License (ODbL) v1.0',
    attribution: '© OpenStreetMap contributors',
    raw_cache_path: path.relative(path.resolve(__dirname, '..'), rawPath),
  };

  const elements = Array.isArray(json.elements) ? json.elements : [];
  const fc = buildFeatureCollection(elements, meta);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(fc, null, 2));

  console.log(`[${nowISO()}] Wrote cleaned GeoJSON to ${OUTPUT_PATH}`);
}

// Node 18+ has global fetch; provide polyfill for older versions if needed
async function run() {
  if (typeof fetch === 'undefined') {
    // Lazy import node-fetch if not available
    const nodeFetch = (await import('node-fetch')).default;
    global.fetch = nodeFetch;
  }
  await main();
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
