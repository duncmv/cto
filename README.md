# Uganda Map – Next.js + MapLibre

Bootstrap Next.js (TypeScript) project with a MapLibre GL JS map centered and bounded to Uganda, plus data ETL scripts, linting, Prettier, and Vercel deployment configuration.

## Tech stack

- Next.js 14 with the app directory and TypeScript
- MapLibre GL JS with a responsive full-bleed map
- ESLint (next/core-web-vitals) and Prettier
- Vercel for hosting and deployments (vercel.json + npm scripts)

## Getting started

1) Install dependencies
- pnpm i or npm i or yarn

2) Create a local env file from the example
- cp .env.local.example .env.local

3) Run the dev server
- pnpm dev or npm run dev or yarn dev

Then open http://localhost:3000.

## Environment variables

This app reads public environment variables at build-time:

- NEXT_PUBLIC_MAP_STYLE_URL (optional)
  - A complete style.json URL for MapLibre. If provided, it takes priority.
- NEXT_PUBLIC_MAPTILER_API_KEY (optional)
  - If provided and NEXT_PUBLIC_MAP_STYLE_URL is not set, the app will use the MapTiler Streets style via:
    https://api.maptiler.com/maps/streets-v2/style.json?key=YOUR_KEY
- If neither is set, the app falls back to the public MapLibre demo style: https://demotiles.maplibre.org/style.json

Data scripts environment variables (used by Node CLI scripts):
- OFFICIAL_SCHOOLS_URL (optional)
  - URL to an official secondary schools dataset (GeoJSON/JSON/CSV). If set, the `build:schools` script will prefer it.
- OVERPASS_URL (optional)
  - Custom Overpass API endpoint for `build:schools` fallback and the dedicated fiber ETL.

Notes
- The Node CLI scripts do not automatically load .env files. Export these in your shell or pass inline when invoking a script, for example:
  - OFFICIAL_SCHOOLS_URL=https://example.com/schools.geojson npm run build:schools
  - OVERPASS_URL=https://overpass.kumi.systems/api/interpreter npm run etl:uganda:fiber
- On Vercel, configure environment variables via the dashboard or `vercel env` for each Environment (Development, Preview, Production).

See .env.local.example for details and placeholders.

## Uganda bounds

The map constrains panning using a slightly expanded bounding box around Uganda and fits to:

- Southwest: [29.573433, -1.482317]
- Northeast: [35.03599, 4.234076]

## Data refresh commands

Two data generation scripts are provided. Outputs are written to public/data/ so they can be served statically by the app.

- Generate/refresh secondary schools dataset (prefers OFFICIAL_SCHOOLS_URL if provided, falls back to Overpass API):
  - npm run build:schools
  - Output: public/data/schools.geojson

- Generate telecom fiber dataset from Overpass API with retries and caching:
  - npm run etl:uganda:fiber
  - Output: public/data/fiber.geojson (and raw cache under data/raw/)

- Run both:
  - npm run data:refresh

Additional docs: docs/uganda-fiber-etl.md

## Scripts

- dev: Start dev server
- build: Production build
- start: Start production server
- lint: Run ESLint
- format: Run Prettier write
- type-check: Run the TypeScript compiler in noEmit mode
- build:schools: Build public/data/schools.geojson
- etl:uganda:fiber: Build public/data/fiber.geojson from Overpass
- data:refresh: Run both data generation scripts
- vercel:dev: Run Vercel local dev server (proxy, env handling)
- vercel:link: Link this local directory to a Vercel project
- vercel:pull-env: Pull Vercel environment variables into .env.local
- deploy:preview: Deploy a Preview build to Vercel via CLI
- deploy:prod: Deploy a Production build to Vercel via CLI

## Deployment (Vercel)

This repository includes a minimal vercel.json and npm scripts for CLI-based deployment. You can deploy either by connecting the GitHub repo to Vercel (recommended) or by using the Vercel CLI.

Option A: Git-based deployments
- Connect the repo in the Vercel dashboard.
- Push to any non-main branch to create Preview deployments.
- Merge/push to main to create Production deployments.
- Configure environment variables per Environment (Development, Preview, Production) in the Vercel dashboard.

Option B: CLI-based deployments
- Ensure the Vercel CLI is available (installed as a devDependency and runnable via npm scripts).
- Link the project (one-time per machine):
  - npm run vercel:link
- Pull environment variables locally (optional, for local dev parity):
  - npm run vercel:pull-env
- Preview deployment from the current branch/commit:
  - npm run deploy:preview
- Production deployment (deploys current working directory as Production):
  - npm run deploy:prod

Notes
- For CLI-based deployments, you may be prompted to log in and select a scope during the link step.
- By default, the app builds via `npm run build` on Vercel. If you need to pre-generate datasets during CI/CD, run the data scripts and commit outputs under public/data/ or integrate them into a custom build step.

## Map style configuration recap

This app reads public environment variables at build-time:
- NEXT_PUBLIC_MAP_STYLE_URL (optional)
- NEXT_PUBLIC_MAPTILER_API_KEY (optional)

If neither is provided, the app uses MapLibre's public demo style.

## Accessibility and controls

- Control panel overlay with a "Recenter Uganda" action
- Toggle layers for Telecom Fiber and Schools
- Filter schools by region, ownership, and gender; client-side clustering with counts

## Development tips

- Keep public environment variables prefixed with NEXT_PUBLIC_.
- Data generated into public/data/ should be committed if you want deterministic builds on Vercel without running ETL during build.
- Node 18+ is recommended (for global fetch support used by the ETL scripts).

## License

MIT (or project-specific — update as appropriate).
