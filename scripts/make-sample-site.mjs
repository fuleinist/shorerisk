#!/usr/bin/env node
/**
 * Build the sample site file. The output is illustrative, not a DEA or council
 * product. It exists so the demo and the tests run without network access.
 *
 * Run: node scripts/make-sample-site.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const R = 6371008.8;
const rad = (deg) => (deg * Math.PI) / 180;
const deg = (value) => (value * 180) / Math.PI;

function offset(point, bearing, metres) {
  const angular = metres / R;
  const br = rad(bearing);
  const lat1 = rad(point[1]);
  const lon1 = rad(point[0]);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(br),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(br) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
  return [((deg(lon2) + 540) % 360) - 180, deg(lat2)];
}

const round = (value, places) => Number(value.toFixed(places));

const COAST_BEARING = 160;
const INLAND_BEARING = 250;
const START = [151.2955, -33.712];
const STEP_M = 240;
const TRANSECT_LENGTH_M = 200;
const TRANSECTS = 12;

const RATES = [-0.32, -0.45, -0.58, -0.71, -0.9, -0.62, -0.48, -0.55, -0.38, -0.25, -0.44, -0.3];
const ERRORS = [0.06, 0.08, 0.09, 0.1, 0.14, 0.09, 0.07, 0.08, 0.06, 0.05, 0.07, 0.06];
const SIGS = [0.004, 0.002, 0.008, 0.003, 0.001, 0.006, 0.011, 0.002, 0.02, 0.031, 0.004, 0.009];
const LABELS = [
  'N01 Narrabeen north',
  'N02 Narrabeen SLSC',
  'N03 North access',
  'N04 Wamberal corner',
  'N05 Surf club',
  'N06 Ocean Street',
  'N07 Park Parade',
  'N08 Cycleway',
  'N09 South access',
  'N10 Lagoon mouth',
  'N11 Cafe strip',
  'N12 South end',
];

const transects = [];
for (let index = 0; index < TRANSECTS; index += 1) {
  const offshore = offset(START, COAST_BEARING, index * STEP_M);
  const onshore = offset(offshore, INLAND_BEARING, TRANSECT_LENGTH_M);
  transects.push({
    id: `N${String(index + 1).padStart(2, '0')}`,
    label: LABELS[index],
    offshore: [round(offshore[0], 6), round(offshore[1], 6)],
    onshore: [round(onshore[0], 6), round(onshore[1], 6)],
    rateMPerYear: RATES[index],
    seMPerYear: ERRORS[index],
    sigPValue: SIGS[index],
    validObs: 30 + (index % 4),
    validSpan: 31 + (index % 3),
    certainty: index === 9 ? 'ok' : 'good',
    source: 'Sample rates for this repository. Not DEA values.',
  });
}

const ASSETS = [
  ['slsc', 'South Narrabeen Surf Life Saving Club', 'building', 4, 16, 0, 2_400_000, 260, 'community'],
  ['stairs-north', 'Beach access stairs, north', 'beach_access', 2, 7, -12, 85_000, 400, 'amenity'],
  ['boardwalk', 'Dune boardwalk', 'path', 3, 9, 8, 160_000, 350, 'amenity'],
  ['outfall-north', 'Stormwater outfall, north', 'drainage', 1, 8, 4, 350_000, 0, 'lifeline'],
  ['ocean-street', 'Ocean Street', 'road', 5, 34, 0, 2_600_000, 3_200, 'lifeline'],
  ['park-parade', 'Narrabeen Park Parade', 'road', 8, 28, 0, 3_100_000, 4_100, 'lifeline'],
  ['cycleway', 'Beachfront cycleway', 'path', 7, 13, 0, 480_000, 900, 'amenity'],
  ['carpark-surf', 'Surf club car park', 'car_park', 4, 26, -18, 750_000, 700, 'amenity'],
  ['toilets', 'Public toilets', 'building', 6, 30, 6, 320_000, 600, 'community'],
  ['tower', 'Lifesaving observation tower', 'building', 4, 10, 22, 140_000, 40, 'community'],
  ['playground', 'Playground', 'other', 9, 55, -30, 180_000, 220, 'amenity'],
  ['cafe', 'Beach cafe', 'building', 10, 40, 0, 900_000, 450, 'community'],
  ['pool-path', 'Ocean pool access path', 'path', 11, 9, 0, 210_000, 300, 'amenity'],
  ['carpark-north', 'North car park', 'car_park', 0, 14, 10, 520_000, 380, 'amenity'],
  ['outfall-south', 'Stormwater outfall, south', 'drainage', 9, 4, -6, 420_000, 0, 'lifeline'],
  ['ramp-south', 'Beach access ramp, south', 'beach_access', 8, 6, 14, 120_000, 520, 'amenity'],
];

const assets = ASSETS.map(([id, name, cls, transectIndex, inland, along, cost, users, criticality]) => {
  const transect = transects[transectIndex];
  const base = offset(transect.offshore, INLAND_BEARING, inland);
  const position = along === 0 ? base : offset(base, COAST_BEARING, along);
  const asset = {
    id,
    name,
    class: cls,
    position: [round(position[0], 6), round(position[1], 6)],
    replacementCostAUD: cost,
    criticality,
  };
  if (users > 0) asset.usersPerDay = users;
  if (cls === 'road' || cls === 'path') {
    asset.lengthM = cls === 'road' ? 900 : 300;
  }
  return asset;
});

const site = {
  id: 'narrabeen',
  name: 'Narrabeen Beach',
  council: 'Northern Beaches Council',
  state: 'NSW',
  baselineYear: 2026,
  provenance: {
    source: 'Sample data generated for this repository',
    dataset: 'Illustrative transects and assets, not a DEA or council product',
    retrieved: '2026-10-30',
    licence: 'MIT for this repository',
    note: 'Sample only. Rates are plausible but not official DEA Coastlines values. Costs are indicative. Replace both with a DEA export and a council asset register.',
  },
  transects,
  assets,
};

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '..', 'data', 'site-narrabeen.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(site, null, 2)}\n`, 'utf8');
console.log(`Wrote ${target}: ${transects.length} transects, ${assets.length} assets.`);