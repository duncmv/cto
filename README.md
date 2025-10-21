# Uganda Map – Next.js + MapLibre

Bootstrap Next.js (TypeScript) project with a MapLibre GL JS map centered and bounded to Uganda, plus linting and Prettier.

## Getting started

- Install dependencies
  - pnpm i or npm i or yarn
- Create a local env file from the example
  - cp .env.local.example .env.local
- Run the dev server
  - pnpm dev or npm run dev or yarn dev

Then open http://localhost:3000.

## Map style configuration

This app reads public environment variables at build-time:

- NEXT_PUBLIC_MAP_STYLE_URL (optional)
  - A complete style.json URL for MapLibre. If provided, it takes priority.
- NEXT_PUBLIC_MAPTILER_API_KEY (optional)
  - If provided and NEXT_PUBLIC_MAP_STYLE_URL is not set, the app will use the MapTiler Streets style via:
    https://api.maptiler.com/maps/streets-v2/style.json?key=YOUR_KEY
- If neither is set, the app falls back to the public MapLibre demo style: https://demotiles.maplibre.org/style.json

See .env.local.example for details.

## Features

- Next.js 14 with the app directory and TypeScript
- MapLibre GL JS with a responsive full-bleed map
- Control panel overlay with a "Recenter Uganda" action
- Map initially fitted and bounded to Uganda
- ESLint (next/core-web-vitals) and Prettier

## Uganda bounds

The map constrains panning using a slightly expanded bounding box around Uganda and fits to:

- Southwest: [29.573433, -1.482317]
- Northeast: [35.03599, 4.234076]

## Scripts

- dev: Start dev server
- build: Production build
- start: Start production server
- lint: Run ESLint
- format: Run Prettier write
- etl:uganda:fiber: Run Overpass ETL to generate public/data/fiber.geojson

## Notes

- Set public env vars with the NEXT_PUBLIC_ prefix so they can be used in the client.
- If you prefer a different style, set NEXT_PUBLIC_MAP_STYLE_URL to any MapLibre-compatible style.json.
