#!/usr/bin/env node
/* eslint-env node */

/*
  Build secondary schools dataset for Uganda (or any region with similar schema).
  - Attempts to load an official dataset (from a local file or OFFICIAL_SCHOOLS_URL env var)
  - Falls back to Overpass API if unavailable
  - Enriches with ownership/gender/district fields and region mapping from data/regions.json
  - Writes GeoJSON to public/data/schools.geojson
  - Logs the data source used
*/

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'public', 'data');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'schools.geojson');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readJSON(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function tryReadLocalOfficialDataset() {
  const candidates = [
    path.join(DATA_DIR, 'official_secondary_schools.geojson'),
    path.join(DATA_DIR, 'official_secondary_schools.json'),
    path.join(DATA_DIR, 'official_secondary_schools.csv'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function fetchText(url, options = {}) {
  // Prefer global fetch if available (Node 18+)
  if (typeof fetch === 'function') {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`Fetch failed ${res.status} ${res.statusText}`);
    return await res.text();
  }
  // Fallback to http/https
  const client = url.startsWith('https:') ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(url, { method: options.method || 'GET', headers: options.headers }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`Request failed with status ${res.statusCode}`));
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function tryParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function detectCSVDelimiter(sample) {
  // Simple delimiter detection among comma, semicolon, tab
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = -1;
  for (const d of candidates) {
    const count = (sample.match(new RegExp(`\${d}`, 'g')) || []).length;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

function parseCSV(text) {
  // Basic CSV parser with quotes handling, delimiter detection
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  // skip empty leading lines
  while (lines.length && lines[0].trim() === '') lines.shift();
  if (lines.length === 0) return [];

  const sample = lines.slice(0, Math.min(lines.length, 5)).join('\n');
  const delimiter = detectCSVDelimiter(sample);

  function splitLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  const header = splitLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === '') continue;
    const cols = splitLine(line);
    const obj = {};
    for (let j = 0; j < header.length; j++) {
      const key = header[j] || `col_${j}`;
      obj[key] = cols[j] !== undefined ? cols[j] : '';
    }
    rows.push(obj);
  }
  return rows;
}

function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9_]/g, '');
}

function normalizeDistrictName(name) {
  if (!name) return '';
  let s = String(name).toLowerCase().trim();
  s = s.replace(/\bdistrict\b/g, '');
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/[^a-z\s]/g, '');
  s = s.trim();
  return s;
}

function buildDistrictToRegionMap(regionsJson) {
  // Support multiple shapes:
  // 1) { districtToRegion: { Kampala: 'Central', ... } }
  // 2) { mappings: [{ region: 'Central', districts: ['Kampala', ...] }, ...] }
  // 3) { regions: [{ name: 'Central', districts: [...] }] }
  // 4) { Central: ['Kampala', ...], Eastern: [...] }
  const mapping = {};

  if (!regionsJson || typeof regionsJson !== 'object') return mapping;

  if (regionsJson.districtToRegion && typeof regionsJson.districtToRegion === 'object') {
    for (const [d, r] of Object.entries(regionsJson.districtToRegion)) {
      mapping[normalizeDistrictName(d)] = String(r);
    }
    return mapping;
  }
  if (Array.isArray(regionsJson.mappings)) {
    for (const entry of regionsJson.mappings) {
      const region = entry.region || entry.name || entry.label;
      const districts = entry.districts || entry.items || [];
      if (!region || !Array.isArray(districts)) continue;
      for (const d of districts) mapping[normalizeDistrictName(d)] = String(region);
    }
    return mapping;
  }
  if (Array.isArray(regionsJson.regions)) {
    for (const entry of regionsJson.regions) {
      const region = entry.region || entry.name || entry.label;
      const districts = entry.districts || entry.items || [];
      if (!region || !Array.isArray(districts)) continue;
      for (const d of districts) mapping[normalizeDistrictName(d)] = String(region);
    }
    return mapping;
  }
  // 4) flat region->districts mapping
  for (const [maybeRegion, value] of Object.entries(regionsJson)) {
    if (Array.isArray(value)) {
      const region = maybeRegion;
      for (const d of value) mapping[normalizeDistrictName(d)] = String(region);
    }
  }
  return mapping;
}

function detectField(obj, candidates) {
  // find first key in obj that matches one of the candidate names (case/space-insensitive)
  const keys = Object.keys(obj);
  const normMap = new Map(keys.map((k) => [normalizeKey(k), k]));
  for (const c of candidates) {
    const got = normMap.get(normalizeKey(c));
    if (got) return got;
  }
  return null;
}

function toNumber(n) {
  const x = Number(String(n).trim());
  return Number.isFinite(x) ? x : null;
}

function guessOwnership(v) {
  if (!v) return 'unknown';
  const s = String(v).toLowerCase();
  if (/gov|public|state/.test(s)) return 'government';
  if (/private|ngo|foundation|independent/.test(s)) return 'private';
  if (/relig|catholic|anglican|muslim|church|islam/.test(s)) return 'religious';
  return s || 'unknown';
}

function guessGender(v) {
  if (!v) return 'unknown';
  const s = String(v).toLowerCase();
  if (/boys|male\b/.test(s)) return 'boys';
  if (/girls|female\b/.test(s)) return 'girls';
  if (/mixed|coed|co-?ed|unisex/.test(s)) return 'mixed';
  return s || 'unknown';
}

function enrichProperties(props, districtToRegion) {
  const p = { ...props };
  p.ownership = guessOwnership(p.ownership || p["operator:type"] || p.operator_type || p.operatorType || p.management);
  p.gender = guessGender(p.gender || p.gender_of_students || p.sex);
  const district = p.district || p["addr:district"] || p["is_in:district"] || p.admin2 || p.ADM2_NAME || p.subcounty;
  p.district = district || null;
  let region = p.region || p.ADM1_NAME || p.province || null;
  if (!region && p.district) {
    region = districtToRegion[normalizeDistrictName(p.district)] || null;
  }
  p.region = region;
  return p;
}

function rowsToGeoJSON(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { type: 'FeatureCollection', features: [] };
  const first = rows[0];
  const latKey = detectField(first, ['lat', 'latitude', 'y', 'geom_lat', 'Latitude', 'Lat']);
  const lonKey = detectField(first, ['lon', 'lng', 'longitude', 'x', 'geom_lon', 'Longitude', 'Long', 'Lng']);
  const nameKey = detectField(first, ['name', 'school', 'school_name', 'name_of_school', 'Name']);
  const ownershipKey = detectField(first, ['ownership', 'ownership_type', 'management', 'operator:type']);
  const genderKey = detectField(first, ['gender', 'gender_of_students', 'sex']);
  const districtKey = detectField(first, ['district', 'adm2', 'admin2', 'ADM2_NAME']);
  if (!latKey || !lonKey) {
    throw new Error('CSV dataset does not contain recognizable lat/lon columns');
  }
  const features = [];
  for (const r of rows) {
    const lat = toNumber(r[latKey]);
    const lon = toNumber(r[lonKey]);
    if (lat == null || lon == null) continue;
    const props = {};
    if (nameKey) props.name = r[nameKey];
    if (ownershipKey) props.ownership = r[ownershipKey];
    if (genderKey) props.gender = r[genderKey];
    if (districtKey) props.district = r[districtKey];
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: props });
  }
  return { type: 'FeatureCollection', features };
}

function basicCentroid(coords) {
  // coords: array of [lon,lat]
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const c of coords) {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      sx += c[0];
      sy += c[1];
      n++;
    }
  }
  if (n === 0) return null;
  return [sx / n, sy / n];
}

function toPointGeometry(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Point') return geometry;
  if (geometry.type === 'MultiPoint') return { type: 'Point', coordinates: geometry.coordinates[0] };
  if (geometry.type === 'LineString') return { type: 'Point', coordinates: basicCentroid(geometry.coordinates) };
  if (geometry.type === 'MultiLineString') return { type: 'Point', coordinates: basicCentroid(geometry.coordinates.flat()) };
  if (geometry.type === 'Polygon') return { type: 'Point', coordinates: basicCentroid(geometry.coordinates.flat()) };
  if (geometry.type === 'MultiPolygon') return { type: 'Point', coordinates: basicCentroid(geometry.coordinates.flat(2)) };
  return null;
}

function anyToFeatureCollection(obj) {
  if (!obj) return { type: 'FeatureCollection', features: [] };
  if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) return obj;
  if (Array.isArray(obj)) return { type: 'FeatureCollection', features: obj };
  // Some APIs nest features under a key
  if (Array.isArray(obj.features)) return { type: 'FeatureCollection', features: obj.features };
  return { type: 'FeatureCollection', features: [] };
}

async function tryLoadOfficialDataset(districtToRegion) {
  // First check a local file under data/
  const localPath = tryReadLocalOfficialDataset();
  if (localPath) {
    const ext = path.extname(localPath).toLowerCase();
    const raw = fs.readFileSync(localPath, 'utf8');
    if (ext === '.csv') {
      const rows = parseCSV(raw);
      let fc = rowsToGeoJSON(rows);
      fc = enrichFeatureCollection(fc, districtToRegion);
      return { source: 'official-local', collection: fc };
    }
    const json = tryParseJSON(raw);
    if (!json) throw new Error('Failed to parse local official dataset JSON');
    let fc = anyToFeatureCollection(json);
    fc = coerceToPoints(fc);
    fc = enrichFeatureCollection(fc, districtToRegion);
    return { source: 'official-local', collection: fc };
  }

  // Otherwise try from URL env var
  const url = process.env.OFFICIAL_SCHOOLS_URL || process.env.SECONDARY_SCHOOLS_URL || '';
  if (!url) return null;
  const text = await fetchText(url);
  const json = tryParseJSON(text);
  if (json) {
    let fc = anyToFeatureCollection(json);
    fc = coerceToPoints(fc);
    fc = enrichFeatureCollection(fc, districtToRegion);
    return { source: 'official-remote', collection: fc };
  }
  // Try CSV
  const rows = parseCSV(text);
  if (rows && rows.length) {
    let fc = rowsToGeoJSON(rows);
    fc = enrichFeatureCollection(fc, districtToRegion);
    return { source: 'official-remote-csv', collection: fc };
  }
  return null;
}

function coerceToPoints(fc) {
  // If features have non-point geometry, compute a centroid-ish point so the map can render markers
  const out = { type: 'FeatureCollection', features: [] };
  for (const f of fc.features || []) {
    const geom = toPointGeometry(f.geometry);
    if (!geom || !Array.isArray(geom.coordinates) || geom.coordinates.some((n) => typeof n !== 'number')) continue;
    out.features.push({ type: 'Feature', geometry: geom, properties: f.properties || {} });
  }
  return out;
}

function enrichFeatureCollection(fc, districtToRegion) {
  const out = { type: 'FeatureCollection', features: [] };
  for (const f of fc.features || []) {
    const props = { ...(f.properties || {}) };
    const nameKey = detectField(props, ['name', 'school', 'school_name', 'Name']);
    if (nameKey && !props.name) props.name = props[nameKey];
    out.features.push({ type: 'Feature', geometry: f.geometry, properties: enrichProperties(props, districtToRegion) });
  }
  return out;
}

function bboxString() {
  // Uganda bounds from lib/mapConfig.ts
  const SW = [29.573433, -1.482317];
  const NE = [35.03599, 4.234076];
  // Overpass expects: south,west,north,east (lat, lon order)
  return `${SW[1]},${SW[0]},${NE[1]},${NE[0]}`;
}

function buildOverpassQuery() {
  const bbox = bboxString();
  return `
  [out:json][timeout:25];
  (
    node["amenity"="school"]["school:level"~"secondary"](${bbox});
    way["amenity"="school"]["school:level"~"secondary"](${bbox});
    relation["amenity"="school"]["school:level"~"secondary"](${bbox});
    node["amenity"="school"]["isced:level"~"2|3"](${bbox});
    way["amenity"="school"]["isced:level"~"2|3"](${bbox});
    relation["amenity"="school"]["isced:level"~"2|3"](${bbox});
  );
  out center tags;`;
}

async function fetchOverpass() {
  const endpoint = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
  const body = buildOverpassQuery();
  const text = await fetchText(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: `data=${encodeURIComponent(body)}`,
  });
  const json = tryParseJSON(text);
  if (!json || !Array.isArray(json.elements)) throw new Error('Invalid Overpass response');
  const features = [];
  for (const el of json.elements) {
    let lon = null;
    let lat = null;
    if (el.type === 'node' && typeof el.lon === 'number' && typeof el.lat === 'number') {
      lon = el.lon;
      lat = el.lat;
    } else if (el.center && typeof el.center.lon === 'number' && typeof el.center.lat === 'number') {
      lon = el.center.lon;
      lat = el.center.lat;
    }
    if (lon == null || lat == null) continue;
    const props = { ...(el.tags || {}) };
    props.name = props.name || props["official_name"] || null;
    // Extract some likely fields for enrichment
    props.ownership = props.ownership || props["operator:type"] || props.operator_type || props.operator;
    props.gender = props.gender || props["student:gender"];
    props.district = props["addr:district"] || props.district || props["is_in:district"] || null;

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: props,
    });
  }
  return { type: 'FeatureCollection', features };
}

async function main() {
  try {
    ensureDir(DATA_DIR);
    ensureDir(OUTPUT_DIR);

    const regionsPath = path.join(DATA_DIR, 'regions.json');
    if (!fs.existsSync(regionsPath)) {
      console.warn(`Warning: ${path.relative(PROJECT_ROOT, regionsPath)} not found. Region enrichment may be limited.`);
    }
    const regionsJson = fs.existsSync(regionsPath) ? readJSON(regionsPath) : {};
    const districtToRegion = buildDistrictToRegionMap(regionsJson);

    let result = null;
    try {
      result = await tryLoadOfficialDataset(districtToRegion);
    } catch (e) {
      console.warn('Official dataset failed to load:', e.message);
    }

    let source = 'official';
    let fc = null;
    if (result && result.collection) {
      source = result.source || 'official';
      fc = result.collection;
    } else {
      console.log('Falling back to Overpass API...');
      const overpassFC = await fetchOverpass();
      fc = enrichFeatureCollection(overpassFC, districtToRegion);
      source = 'overpass';
    }

    const output = { type: 'FeatureCollection', features: fc.features, meta: { generatedAt: new Date().toISOString(), source } };
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output));
    console.log(`Wrote ${fc.features.length} features to ${path.relative(PROJECT_ROOT, OUTPUT_PATH)}`);
    console.log(`Data source used: ${source}`);
  } catch (err) {
    console.error('Error building schools dataset:', err);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
