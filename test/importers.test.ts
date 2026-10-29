import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DataError } from '../src/errors.js';
import {
  buildTransects,
  classifyTags,
  orderAlongCoast,
  parseCsv,
  parseDeaCsv,
  parseDeaGeoJson,
  parseOverpass,
} from '../src/importers.js';
import { bearingDeg, distanceM } from '../src/geo.js';

test('parseCsv handles quotes and commas', () => {
  const rows = parseCsv('a,b\n"one, two","say ""hi"""\n');
  assert.deepEqual(rows[1], ['one, two', 'say "hi"']);
});

test('parseDeaCsv reads the DEA rate columns', () => {
  const csv = [
    'uid,lon,lat,rate_time,se_time,sig_time,valid_obs,valid_span,certainty',
    'abc,151.3,-33.70,-0.4,0.1,0.002,30,32,good',
    'def,151.31,-33.71,-0.2,0.05,0.02,28,30,ok',
  ].join('\n');
  const points = parseDeaCsv(csv);
  assert.equal(points.length, 2);
  assert.equal(points[0]?.rateMPerYear, -0.4);
  assert.equal(points[0]?.seMPerYear, 0.1);
  assert.equal(points[0]?.validSpan, 32);
  assert.equal(points[1]?.uid, 'def');
});

test('parseDeaCsv rejects a file with no usable rows', () => {
  assert.throws(() => parseDeaCsv('uid,lon,lat\nabc,151,-33\n'), DataError);
});

test('parseDeaGeoJson reads point features', () => {
  const geojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [151.3, -33.7] },
        properties: {
          uid: 'x1',
          rate_time: -0.55,
          se_time: 0.12,
          sig_time: 0.004,
          valid_obs: 31,
          valid_span: 33,
          certainty: 'good',
        },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [151.31, -33.71] },
        properties: { uid: 'x2', rate_time: -0.3 },
      },
    ],
  };
  const points = parseDeaGeoJson(JSON.stringify(geojson));
  assert.equal(points.length, 2);
  assert.equal(points[0]?.uid, 'x1');
  assert.equal(points[0]?.sigPValue, 0.004);
  assert.equal(points[1]?.seMPerYear, undefined);
});

test('parseDeaGeoJson rejects a non collection', () => {
  assert.throws(() => parseDeaGeoJson('{"type":"Point"}'), DataError);
});

test('orderAlongCoast returns a continuous chain', () => {
  const points = [0, 1, 2, 3, 4].map((index) => ({ lon: 151.3, lat: -33.7 - index * 0.001 }));
  const order = orderAlongCoast(points);
  assert.equal(order.length, 5);
  for (let index = 1; index < order.length; index += 1) {
    assert.equal(Math.abs((order[index] ?? 0) - (order[index - 1] ?? 0)), 1);
  }
});

test('buildTransects creates inland transects from points', () => {
  const points = [
    { uid: 'a', lon: 151.3, lat: -33.7, rateMPerYear: -0.4 },
    { uid: 'b', lon: 151.3, lat: -33.701, rateMPerYear: -0.5 },
    { uid: 'c', lon: 151.3, lat: -33.702, rateMPerYear: -0.6 },
  ];
  const result = buildTransects(points, { seawardBearingDeg: 90, transectLengthM: 150 });
  assert.equal(result.transects.length, 3);
  const first = result.transects[0];
  assert.ok(first);
  assert.equal(first.id, 'T001');
  assert.equal(first.label, 'a');
  assert.ok(Math.abs(distanceM(first.offshore, first.onshore) - 150) < 1);
  assert.ok(Math.abs(bearingDeg(first.offshore, first.onshore) - 90) < 1);
  assert.ok(result.notes.length >= 2);
});

test('buildTransects honours explicit ends', () => {
  const points = [
    {
      uid: 'a',
      lon: 151.3,
      lat: -33.7,
      rateMPerYear: -0.4,
      offshore: [151.3, -33.7] as const,
      onshore: [151.3, -33.699] as const,
    },
  ];
  const result = buildTransects(points);
  assert.equal(result.transects.length, 1);
  assert.deepEqual(result.transects[0]?.onshore, [151.3, -33.699]);
});

test('classifyTags maps OSM tags', () => {
  assert.equal(classifyTags({ highway: 'residential' }), 'road');
  assert.equal(classifyTags({ highway: 'footway' }), 'path');
  assert.equal(classifyTags({ building: 'yes' }), 'building');
  assert.equal(classifyTags({ amenity: 'parking' }), 'car_park');
  assert.equal(classifyTags({ man_made: 'outfall' }), 'drainage');
  assert.equal(classifyTags({ leisure: 'slipway' }), 'beach_access');
  assert.equal(classifyTags({ natural: 'tree' }), null);
});

test('parseOverpass imports supported elements and skips the rest', () => {
  const response = {
    elements: [
      {
        type: 'way',
        id: 1,
        center: { lat: -33.7, lon: 151.3 },
        tags: { highway: 'residential', name: 'Ocean Street' },
      },
      { type: 'node', id: 2, lat: -33.701, lon: 151.301, tags: { amenity: 'parking' } },
      { type: 'node', id: 3, lat: -33.702, lon: 151.302, tags: { building: 'yes' } },
      {
        type: 'way',
        id: 4,
        center: { lat: -33.703, lon: 151.303 },
        tags: { man_made: 'outfall' },
      },
      {
        type: 'node',
        id: 5,
        lat: -33.704,
        lon: 151.304,
        tags: { highway: 'footway', name: 'Track' },
      },
      {
        type: 'way',
        id: 6,
        center: { lat: -33.705, lon: 151.305 },
        tags: { leisure: 'slipway' },
      },
      { type: 'node', id: 7, lat: -33.706, lon: 151.306, tags: { natural: 'tree' } },
      {
        type: 'way',
        id: 8,
        geometry: [
          { lat: -33.7, lon: 151.3 },
          { lat: -33.7009, lon: 151.3 },
        ],
        tags: { highway: 'service', name: 'Lane' },
      },
    ],
  };
  const result = parseOverpass(JSON.stringify(response));
  assert.equal(result.assets.length, 7);
  assert.equal(result.skipped, 1);
  const road = result.assets.find((asset) => asset.id === 'way-1');
  assert.ok(road);
  assert.equal(road.class, 'road');
  assert.equal(road.name, 'Ocean Street');
  assert.equal(road.costIsEstimate, true);
  const lane = result.assets.find((asset) => asset.id === 'way-8');
  assert.ok(lane);
  assert.ok(lane.lengthM !== undefined && Math.abs(lane.lengthM - 100) < 2, `length ${lane.lengthM}`);
});

test('parseOverpass rejects a bad payload', () => {
  assert.throws(() => parseOverpass('{"foo":1}'), DataError);
});