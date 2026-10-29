import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../src/model.js';
import {
  consequenceOf,
  costFactor,
  criticalityOf,
  rankAssets,
  scoreOf,
  summarise,
  userFactor,
} from '../src/rank.js';
import { assessSite } from '../src/exposure.js';
import { offsetPoint } from '../src/geo.js';
import { makeAsset, makeSite, placeNorth } from './helpers.js';

const threeAssets = () => [
  makeAsset({ id: 'a1', name: 'Path', class: 'path', position: placeNorth(10), replacementCostAUD: 100_000, usersPerDay: 100, lengthM: 50 }),
  makeAsset({ id: 'a2', name: 'Road', class: 'road', position: placeNorth(40), replacementCostAUD: 2_000_000, usersPerDay: 3000, criticality: 'lifeline', lengthM: 500 }),
  makeAsset({ id: 'a3', name: 'Building', class: 'building', position: placeNorth(25), replacementCostAUD: 500_000, usersPerDay: 200, criticality: 'community' }),
];

test('costFactor is bounded and log scaled', () => {
  assert.equal(costFactor(0), 0);
  assert.equal(costFactor(10_000), 0);
  assert.ok(Math.abs(costFactor(1_000_000) - 2 / 3) < 1e-9);
  assert.equal(costFactor(10_000_000), 1);
  assert.equal(costFactor(1_000_000_000), 1);
});

test('userFactor is bounded', () => {
  assert.equal(userFactor(0), 0);
  assert.equal(userFactor(5000), 1);
  assert.ok(userFactor(100) > 0 && userFactor(100) < 1);
});

test('criticality defaults by asset class', () => {
  assert.equal(criticalityOf(makeAsset({ class: 'road' })), 'lifeline');
  assert.equal(criticalityOf(makeAsset({ class: 'drainage' })), 'lifeline');
  assert.equal(criticalityOf(makeAsset({ class: 'path' })), 'amenity');
  assert.equal(criticalityOf(makeAsset({ class: 'building' })), 'community');
});

test('consequence combines cost, users and criticality', () => {
  const asset = makeAsset({
    replacementCostAUD: 2_400_000,
    usersPerDay: 260,
    class: 'building',
    criticality: 'community',
  });
  const value = consequenceOf(asset);
  assert.ok(value > 60 && value < 85, `got ${value}`);
});

test('score uses the 60/40 split', () => {
  const asset = makeAsset({ replacementCostAUD: 100_000, usersPerDay: 100 });
  const { urgency, consequence, score } = scoreOf(asset, 'A');
  assert.equal(urgency, 100);
  assert.equal(score, Math.round(0.6 * 100 + 0.4 * consequence));
});

test('rankAssets sorts by score and drops unassigned assets', () => {
  const far = makeAsset({ id: 'far', name: 'Far', position: offsetPoint(placeNorth(10), 90, 140) });
  const site = makeSite({ assets: [...threeAssets(), far] });
  const exposures = assessSite(site);
  const ranked = rankAssets(site, exposures);
  assert.deepEqual(
    ranked.map((row) => row.asset.id),
    ['a1', 'a3', 'a2'],
  );
  assert.deepEqual(
    ranked.map((row) => row.rank),
    [1, 2, 3],
  );
});

test('equal scores break by earlier exposure', () => {
  const nearer = makeAsset({ id: 'near', name: 'Near', position: placeNorth(8) });
  const farther = makeAsset({ id: 'far', name: 'Far', position: placeNorth(10) });
  const site = makeSite({ assets: [farther, nearer] });
  const ranked = rankAssets(site, assessSite(site));
  assert.equal(ranked[0]?.asset.id, 'near');
  assert.equal(ranked[0]?.score, ranked[1]?.score);
});

test('summarise counts bands, values and route length', () => {
  const site = makeSite({ assets: threeAssets() });
  const exposures = assessSite(site);
  const ranked = rankAssets(site, exposures);
  const summary = summarise(site, exposures, ranked);
  assert.equal(summary.assetCount, 3);
  assert.equal(summary.assessedCount, 3);
  assert.equal(summary.bandCounts.A, 1);
  assert.equal(summary.bandCounts.B, 1);
  assert.equal(summary.bandCounts.C, 1);
  assert.equal(summary.valueAtRiskBandAAUD, 100_000);
  assert.equal(summary.valueAtRiskBandABAUD, 600_000);
  assert.equal(summary.routeLengthAtRiskM, 50);
  assert.equal(summary.assessedShare, 1);
});

test('summarise reports unassigned assets', () => {
  const far = makeAsset({ id: 'far', name: 'Far', position: offsetPoint(placeNorth(10), 90, 140) });
  const site = makeSite({ assets: [makeAsset(), far] });
  const summary = summarise(site, assessSite(site), rankAssets(site, assessSite(site)));
  assert.equal(summary.unassignedCount, 1);
  assert.equal(summary.assessedCount, 1);
});

test('the model carries warnings and interventions', () => {
  const site = makeSite({ assets: threeAssets() });
  const model = buildModel(site, { now: new Date('2026-10-30T00:00:00Z') });
  assert.equal(model.generatedAt, '2026-10-30T00:00:00.000Z');
  assert.equal(model.interventions.length, 3);
  assert.ok(model.warnings.some((warning) => /sample data/i.test(warning)) === false);
  assert.equal(model.ranked.length, 3);
});

test('a sample provenance raises the sample warning', () => {
  const site = makeSite();
  site.provenance.note = 'Sample only.';
  const model = buildModel(site);
  assert.ok(model.warnings.some((warning) => /sample data/i.test(warning)));
});

test('the horizon limits band C', () => {
  const asset = makeAsset({ position: placeNorth(30) });
  const site = makeSite({ assets: [asset] });
  const model = buildModel(site, { horizonYears: 40 });
  assert.equal(model.exposures[0]?.band, 'D');
});