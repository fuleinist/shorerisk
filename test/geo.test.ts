import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bearingDeg,
  distanceM,
  offsetPoint,
  projectOntoTransect,
  projectionFor,
} from '../src/geo.js';

test('distanceM matches one degree of latitude', () => {
  const value = distanceM([151, -33], [151, -32]);
  assert.ok(Math.abs(value - 111_195) < 60, `got ${value}`);
});

test('distanceM is zero for the same point', () => {
  assert.equal(distanceM([151, -33], [151, -33]), 0);
});

test('bearingDeg gives the four cardinal directions', () => {
  assert.ok(Math.abs(bearingDeg([0, 0], [0, 1])) < 0.01);
  assert.ok(Math.abs(bearingDeg([0, 0], [1, 0]) - 90) < 0.01);
  assert.ok(Math.abs(bearingDeg([0, 0], [0, -1]) - 180) < 0.01);
  assert.ok(Math.abs(bearingDeg([0, 0], [-1, 0]) - 270) < 0.01);
});

test('offsetPoint round trips distance and bearing', () => {
  const start = [151.3, -33.7] as const;
  const moved = offsetPoint(start, 45, 1000);
  assert.ok(Math.abs(distanceM(start, moved) - 1000) < 1);
  assert.ok(Math.abs(bearingDeg(start, moved) - 45) < 0.5);
});

test('projection round trips local coordinates', () => {
  const projection = projectionFor([151.3, -33.7]);
  const point = offsetPoint([151.3, -33.7], 120, 850);
  const local = projection.toLocal(point);
  const back = projection.toLonLat(local);
  assert.ok(distanceM(point, back) < 0.02, `error ${distanceM(point, back)} m`);
  assert.ok(local.x > 0, 'a bearing of 120 degrees is east and south');
  assert.ok(local.y < 0, 'a bearing of 120 degrees is east and south');
});

test('projectOntoTransect measures inland distance and offset', () => {
  const result = projectOntoTransect({ x: 10, y: 40 }, { x: 0, y: 0 }, { x: 0, y: 100 });
  assert.ok(Math.abs(result.t - 0.4) < 1e-9);
  assert.ok(Math.abs(result.inlandM - 40) < 1e-9);
  assert.ok(Math.abs(result.crossTrackM - 10) < 1e-9);
  assert.equal(result.lengthM, 100);
});

test('projectOntoTransect signs the cross-track offset', () => {
  const left = projectOntoTransect({ x: -10, y: 40 }, { x: 0, y: 0 }, { x: 0, y: 100 });
  assert.ok(left.crossTrackM < 0);
});

test('projectOntoTransect rejects a zero length transect', () => {
  assert.throws(
    () => projectOntoTransect({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 0, y: 0 }),
    /zero length/,
  );
});