# Uganda Telecom Fiber ETL

This repository includes a Node.js ETL script that pulls telecom fiber features for Uganda from the OpenStreetMap Overpass API, caches the raw response, and writes normalized GeoJSON for use by the app.

## How it works

- Queries multiple Overpass API endpoints with retry and exponential backoff.
- Caches the raw Overpass JSON under `data/raw/` with a timestamp and a short hash of the query.
- Converts OSM elements to GeoJSON features:
  - Nodes become Point features
  - Ways become LineString features
  - Relations become MultiLineString (or LineString when single member) by joining member way geometries
- Adds metadata into the output FeatureCollection including the query and assumptions.

## Overpass Query

```
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
out body geom qt;
```

## Assumptions

- Fiber optic lines are tagged as either:
  - `cable=telecom` + `cable:medium=fibre`/`fiber`, or
  - `communication:line` + `communication:medium=fibre`/`fiber`.
- Telecom points of presence include:
  - `telecom=exchange|distribution_point|data_center` nodes,
  - street cabinets with `man_made=street_cabinet` + `telecom=*`,
  - poles with `man_made=utility_pole` + `utility=telecom`.
- Mapping coverage varies by region and contributors; not all fiber is in OSM.
- Relation geometries are simplified by concatenating member ways into a MultiLineString.

## Running the ETL

Ensure Node.js 18+ is installed (for global fetch). Then run:

```
npm run etl:uganda:fiber
```

Outputs:
- Raw Overpass JSON cache: `data/raw/uganda-fiber-<timestamp>-<hash>.json`
- Cleaned GeoJSON: `public/data/fiber.geojson`
