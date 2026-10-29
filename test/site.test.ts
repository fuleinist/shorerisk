import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DataError } from '../src/errors.js';
import { parseSiteJson, validateSite } from '../src/site.js';
import { makeSite } from './helpers.js';

const clone = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

test('a valid site passes', () => {
  const result = validateSite(clone(makeSite()));
  assert.equal(result.site.id, 'test');
  assert.equal(result.site.transects.length, 1);
  assert.equal(result.warnings.length, 0);
});

test('a missing id is an error', () => {
  const site = clone(makeSite()) as Record<string, unknown>;
  delete site.id;
  assert.throws(() => validateSite(site), /site.id: is required/);
});

test('a bad baseline year is an error', () => {
  const site = clone(makeSite()) as Record<string, unknown>;
  site.baselineYear = 1800;
  assert.throws(() => validateSite(site), /baselineYear/);
});

test('a duplicate transect id is an error', () => {
  const raw = clone(makeSite()) as { transects: unknown[] };
  raw.transects.push(clone(raw.transects[0]));
  assert.throws(() => validateSite(raw), /duplicate id T1/);
});

test('a short transect is an error', () => {
  const raw = clone(makeSite()) as { transects: { onshore: [number, number] }[] };
  const first = raw.transects[0];
  assert.ok(first);
  first.onshore = [151.3, -33.6999];
  assert.throws(() => validateSite(raw), /minimum is 20 m/);
});

test('a missing asset class is an error', () => {
  const raw = clone(makeSite()) as { assets: Record<string, unknown>[] };
  const first = raw.assets[0];
  assert.ok(first);
  delete first.class;
  assert.throws(() => validateSite(raw), /class/);
});

test('an unknown asset class is an error', () => {
  const raw = clone(makeSite()) as { assets: Record<string, unknown>[] };
  const first = raw.assets[0];
  assert.ok(first);
  first.class = 'pier';
  assert.throws(() => validateSite(raw), /must be one of/);
});

test('a negative cost is an error', () => {
  const raw = clone(makeSite()) as { assets: Record<string, unknown>[] };
  const first = raw.assets[0];
  assert.ok(first);
  first.replacementCostAUD = -1;
  assert.throws(() => validateSite(raw), /at least 0/);
});

test('a zero cost is a warning', () => {
  const raw = clone(makeSite()) as { assets: Record<string, unknown>[] };
  const first = raw.assets[0];
  assert.ok(first);
  first.replacementCostAUD = 0;
  const result = validateSite(raw);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0]?.level, 'warning');
});

test('a longitude outside the range is an error', () => {
  const raw = clone(makeSite()) as { transects: { offshore: [number, number] }[] };
  const first = raw.transects[0];
  assert.ok(first);
  first.offshore = [200, -33.7];
  assert.throws(() => validateSite(raw), /longitude/);
});

test('a transect rate outside the range is an error', () => {
  const raw = clone(makeSite()) as { transects: { rateMPerYear: number }[] };
  const first = raw.transects[0];
  assert.ok(first);
  first.rateMPerYear = -99;
  assert.throws(() => validateSite(raw), /must be at least -20/);
});

test('an empty asset list is an error', () => {
  const raw = clone(makeSite()) as { assets: unknown[] };
  raw.assets = [];
  assert.throws(() => validateSite(raw), /non-empty array/);
});

test('invalid JSON raises a data error', () => {
  assert.throws(() => parseSiteJson('{not json'), DataError);
});

test('non-object input raises a data error', () => {
  assert.throws(() => validateSite([]), DataError);
});