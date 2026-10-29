# PLAN — shorerisk v0.1

## Cycle 1 — core and spec

- Write `SPEC.md` and `PLAN.md`.
- Write `src/types.ts` and `src/geo.ts`.
- Write tests for distance, bearing, projection and transect projection.
- Commit.

## Cycle 2 — exposure and ranking

- Write `src/site.ts`: parse and validate a site file.
- Write `src/exposure.ts`: assign assets, compute cases, bands and confidence.
- Write `src/rank.ts`: score and sort.
- Tests for each branch: retreat, accretion, no error value, seaward asset,
  low confidence, unassigned asset, tie-break.
- Commit.

## Cycle 3 — adaptation and model

- Write `src/adapt.ts`: catalogue, selection, intervention summary.
- Write `src/model.ts`: one call that returns the full site model.
- Tests for option selection, cost totals and summary counts.
- Commit.

## Cycle 4 — outputs and CLI

- Write `src/brief.ts`, `src/plan.ts`, `src/geojson.ts`.
- Write `src/cli.ts` with all commands and exit codes.
- Tests for escaping, SVG validity, GeoJSON shape and CLI behaviour.
- Commit.

## Cycle 5 — importers and sample site

- Write `src/importers.ts`: DEA CSV, DEA GeoJSON, Overpass JSON.
- Build `data/site-narrabeen.json` as a marked sample.
- Test the importers on small fixtures.
- Commit.

## Cycle 6 — PWA and README

- Write `web/` static app, manifest and service worker.
- Generate `web/model.json`, `brief.html`, `plan.svg` and `risk.geojson`.
- Add the logo. Capture screenshots with agent-browser.
- Write the README.
- Commit and push.

## Budget

Ten cycles maximum. Each cycle ends with a commit. Each cycle must keep
`npm run build` and `npm test` green.