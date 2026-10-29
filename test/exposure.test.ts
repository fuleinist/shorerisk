import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessAsset, assessSite, bandForYear, prepareSite } from '../src/exposure.js';
import { offsetPoint } from '../src/geo.js';
import { makeAsset, makeSite, makeTransect, placeNorth, START } from './helpers.js';

test('bandForYear covers every boundary', () => {
  assert.equal(bandForYear(0), 'A');
  assert.equal(bandForYear(20), 'A');
  assert.equal(bandForYear(20.001), 'B');
  assert.equal(bandForYear(50), 'B');
  assert.equal(bandForYear(50.001), 'C');
  assert.equal(bandForYear(100), 'C');
  assert.equal(bandForYear(100.001), 'D');
  assert.equal(bandForYear(null), 'D');
});

test('a 10 m asset on a 0.5 m/yr coast is exposed in 20 years', () => {
  const site = makeSite();
  const [exposure] = assessSite(site);
  assert.ok(exposure);
  assert.equal(exposure.transectId, 'T1');
  assert.ok(exposure.inlandDistanceM !== null && Math.abs(exposure.inlandDistanceM - 10) < 0.2);
  assert.ok(exposure.exposureYearBest !== null && Math.abs(exposure.exposureYearBest - 20) < 0.2);
  assert.equal(exposure.band, 'A');
  assert.equal(exposure.exposureDateBest, 2046);
  assert.equal(exposure.confidence, 'high');
  assert.equal(exposure.uncertain, false);
});

test('the confidence cases bracket the best estimate', () => {
  const site = makeSite();
  const [exposure] = assessSite(site);
  assert.ok(exposure);
  assert.ok(
    exposure.exposureYearOptimistic !== null &&
      exposure.exposureYearOptimistic > (exposure.exposureYearBest ?? 0),
  );
  assert.ok(
    exposure.exposureYearPessimistic !== null &&
      exposure.exposureYearPessimistic < (exposure.exposureYearBest ?? 0),
  );
  assert.ok(Math.abs((exposure.exposureYearPessimistic ?? 0) - 14.4) < 0.5);
  assert.ok(Math.abs((exposure.exposureYearOptimistic ?? 0) - 32.9) < 0.5);
});

test('a zero standard error collapses the confidence range', () => {
  const site = makeSite({ transects: [makeTransect({ seMPerYear: 0 })] });
  const [exposure] = assessSite(site);
  assert.ok(exposure);
  assert.equal(exposure.exposureYearBest, exposure.exposureYearOptimistic);
  assert.equal(exposure.exposureYearBest, exposure.exposureYearPessimistic);
});

test('an asset at the baseline shoreline is already exposed', () => {
  const site = makeSite({ assets: [makeAsset({ position: START })] });
  const [exposure] = assessSite(site);
  assert.ok(exposure);
  assert.equal(exposure.alreadyExposed, true);
  assert.equal(exposure.band, 'A');
  assert.equal(exposure.exposureYearBest, 0);
  assert.match(exposure.note, /at or seaward/);
});

test('an asset seaward of the baseline is already exposed', () => {
  const site = makeSite({ assets: [makeAsset({ position: offsetPoint(START, 180, 15) })] });
  const [exposure] = assessSite(site);
  assert.ok(exposure);
  assert.ok(exposure.inlandDistanceM !== null && exposure.inlandDistanceM < 0);
  assert.equal(exposure.alreadyExposed, true);
});

test('an accreting coast projects no exposure', () => {
  const site = makeSite({ transects: [makeTransect({ rateMPerYear: 0.2 })] });
  const [exposure] = assessSite(site);
  assert.ok(exposure);
  assert.equal(exposure.exposureYearBest, null);
  assert.equal(exposure.band, 'D');
  assert.match(exposure.note, /no retreat/);
});

test('a stable coast projects no exposure', () => {
  const site = makeSite({ transects: [makeTransect({ rateMPerYear: 0 })] });
  const [exposure] = assessSite(site);
  assert.ok(exposure);
  assert.equal(exposure.exposureYearBest, null);
  assert.equal(exposure.band, 'D');
});

test('an asset far from every transect is not assessed', () => {
  const far = offsetPoint(placeNorth(10), 90, 120);
  const site = makeSite({ assets: [makeAsset({ position: far })] });
  const [exposure] = assessSite(site);
  assert.ok(exposure);
  assert.equal(exposure.assignmentGrade, 'none');
  assert.equal(exposure.confidence, 'none');
  assert.equal(exposure.transectId, null);
  assert.match(exposure.note, /No transect covers/);
});

test('a moderate cross-track offset lowers the assignment grade', () => {
  const offset = offsetPoint(placeNorth(10), 90, 22);
  const site = makeSite({ assets: [makeAsset({ position: offset })] });
  const [exposure] = assessSite(site);
  assert.ok(exposure);
  assert.equal(exposure.assignmentGrade, 'medium');
  assert.equal(exposure.confidence, 'medium');
});

test('a weak rate lowers the data grade', () => {
  const site = makeSite({
    transects: [makeTransect({ sigPValue: 0.4, validSpan: 6 })],
  });
  const [exposure] = assessSite(site);
  assert.ok(exposure);
  assert.equal(exposure.dataGrade, 'low');
  assert.equal(exposure.confidence, 'low');
});

test('the source grade can lower a strong rate', () => {
  const site = makeSite({ transects: [makeTransect({ certainty: 'poor' })] });
  const [exposure] = assessSite(site);
  assert.ok(exposure);
  assert.equal(exposure.dataGrade, 'low');
  assert.match(exposure.note, /retreats/);
});

test('a wide confidence range raises the uncertain flag', () => {
  const site = makeSite({
    transects: [makeTransect({ rateMPerYear: -0.5, seMPerYear: 0.25 })],
    assets: [makeAsset({ position: placeNorth(11) })],
  });
  const [exposure] = assessSite(site);
  assert.ok(exposure);
  assert.equal(exposure.band, 'B');
  const pessimisticBand = bandForYear(exposure.exposureYearPessimistic);
  assert.equal(pessimisticBand, 'A');
  assert.equal(exposure.uncertain, true);
});

test('prepareSite builds local transect coordinates', () => {
  const site = makeSite();
  const prepared = prepareSite(site);
  const transect = prepared.transects[0];
  assert.ok(transect);
  assert.ok(Math.abs(transect.lengthM - 200) < 1);
  assert.ok(Math.abs(transect.endLocal.y - 200) < 1);
  assert.equal(prepared.assets.length, 1);
});

test('assessAsset works with a prepared site', () => {
  const site = makeSite();
  const prepared = prepareSite(site);
  const asset = prepared.assets[0];
  const transect = prepared.transects[0];
  assert.ok(asset && transect);
  const exposure = assessAsset(asset.asset, asset.local, prepared.transects);
  assert.equal(exposure.assetId, 'a1');
  assert.equal(exposure.band, 'A');
});