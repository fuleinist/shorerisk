import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBrief } from '../src/brief.js';
import { buildModel } from '../src/model.js';
import { renderPlan } from '../src/plan.js';
import { toGeoJson } from '../src/geojson.js';
import { makeAsset, makeSite, placeNorth } from './helpers.js';

const site = () =>
  makeSite({
    assets: [
      makeAsset({ id: 'a1', name: 'Dune path', class: 'path', position: placeNorth(10) }),
      makeAsset({
        id: 'a2',
        name: 'Ocean Street',
        class: 'road',
        position: placeNorth(40),
        replacementCostAUD: 2_000_000,
        usersPerDay: 3000,
        criticality: 'lifeline',
        lengthM: 400,
      }),
    ],
  });

test('the brief has the main sections', () => {
  const html = renderBrief(buildModel(site(), { now: new Date('2026-10-30T00:00:00Z') }));
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<h1>Test Beach<\/h1>/);
  assert.match(html, /Ranked assets/);
  assert.match(html, /Priority interventions/);
  assert.match(html, /Method/);
  assert.match(html, /Limits/);
  assert.match(html, /generated 30 Oct 2026/);
});

test('the brief escapes asset names', () => {
  const model = buildModel(
    makeSite({ assets: [makeAsset({ name: '<script>alert(1)</script>' })] }),
  );
  const html = renderBrief(model);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
});

test('the brief caps the ranked table at 12 rows', () => {
  const assets = Array.from({ length: 15 }, (_, index) =>
    makeAsset({ id: `a${index}`, name: `Asset ${index}`, position: placeNorth(6 + index) }),
  );
  const html = renderBrief(buildModel(makeSite({ assets })));
  assert.match(html, /Showing the top 12 of 15 assessed assets/);
});

test('the brief shows the band counts', () => {
  const html = renderBrief(buildModel(site()));
  assert.match(html, /in band A/);
  assert.match(html, /Act now/);
});

test('the plan is a valid SVG with one circle per asset', () => {
  const model = buildModel(site());
  const svg = renderPlan(site(), model);
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg, /viewBox="0 0 960 640"/);
  assert.match(svg, /<title>Test Beach coastal risk plan<\/title>/);
  const circles = svg.match(/<circle class="asset"/g) ?? [];
  assert.equal(circles.length, model.summary.assessedCount);
});

test('the plan escapes the site name', () => {
  const model = buildModel(makeSite());
  const svg = renderPlan(makeSite({ name: '<b>Beach</b>' }), model);
  assert.ok(!svg.includes('<b>'));
});

test('the plan uses only XML-safe entities', () => {
  const svg = renderPlan(site(), buildModel(site()));
  const entities = svg.match(/&[a-zA-Z]+;/g) ?? [];
  const allowed = new Set(['&amp;', '&lt;', '&gt;', '&quot;', '&apos;']);
  for (const entity of entities) {
    assert.ok(allowed.has(entity), `unknown XML entity ${entity}`);
  }
});

test('the GeoJSON export has one feature per asset', () => {
  const model = buildModel(site());
  const collection = toGeoJson(site(), model);
  assert.equal(collection.type, 'FeatureCollection');
  assert.equal(collection.features.length, 2);
  const first = collection.features[0];
  assert.ok(first);
  assert.equal(first.geometry.type, 'Point');
  assert.equal(first.properties.band, 'A');
  assert.equal(first.properties.assessed, true);
  assert.equal(first.properties.score !== null, true);
  assert.equal(first.properties.replacement_cost_aud, 100_000);
});

test('the GeoJSON export marks unassigned assets', () => {
  const far = makeAsset({ id: 'far', name: 'Far', position: placeNorth(10) });
  far.position = [151.31, -33.7];
  const model = buildModel(makeSite({ assets: [far] }));
  const collection = toGeoJson(makeSite({ assets: [far] }), model);
  assert.equal(collection.features[0]?.properties.assessed, false);
  assert.equal(collection.features[0]?.properties.band, 'D');
  assert.equal(collection.features[0]?.properties.score, null);
});