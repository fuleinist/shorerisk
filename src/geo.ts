import type { LocalPoint, LonLat } from './types.js';

export type { LocalPoint } from './types.js';

export const EARTH_RADIUS_M = 6371008.8;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

export interface Projection {
  origin: LonLat;
  toLocal(point: LonLat): LocalPoint;
  toLonLat(point: LocalPoint): LonLat;
}

export function distanceM(a: LonLat, b: LonLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees clockwise from north. */
export function bearingDeg(a: LonLat, b: LonLat): number {
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLon = toRad(b[0] - a[0]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Move a point by a distance along a bearing. */
export function offsetPoint(point: LonLat, bearing: number, metres: number): LonLat {
  const angular = metres / EARTH_RADIUS_M;
  const br = toRad(bearing);
  const lat1 = toRad(point[1]);
  const lon1 = toRad(point[0]);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(br),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(br) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
  return [normaliseLon(toDeg(lon2)), toDeg(lat2)];
}

export function normaliseLon(lon: number): number {
  return ((lon + 540) % 360) - 180;
}

/**
 * Local tangent-plane projection. Accurate to about 1 m over 20 km.
 * Used for distances and offsets, never for area or bearing at scale.
 */
export function projectionFor(origin: LonLat): Projection {
  const cosLat = Math.cos(toRad(origin[1]));
  return {
    origin,
    toLocal(point: LonLat): LocalPoint {
      return {
        x: toRad(point[0] - origin[0]) * EARTH_RADIUS_M * cosLat,
        y: toRad(point[1] - origin[1]) * EARTH_RADIUS_M,
      };
    },
    toLonLat(point: LocalPoint): LonLat {
      return [
        normaliseLon(origin[0] + toDeg(point.x / (EARTH_RADIUS_M * cosLat))),
        origin[1] + toDeg(point.y / EARTH_RADIUS_M),
      ];
    },
  };
}

export interface TransectProjection {
  /** Position along the axis. 0 at the start (shoreline), 1 at the end (inland). */
  t: number;
  /** Distance inland from the start point, metres. Negative is seaward. */
  inlandM: number;
  /** Signed perpendicular offset from the axis, metres. */
  crossTrackM: number;
  lengthM: number;
}

export function projectOntoTransect(
  point: LocalPoint,
  start: LocalPoint,
  end: LocalPoint,
): TransectProjection {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    throw new Error('Transect has zero length');
  }
  const length = Math.sqrt(lengthSq);
  const vx = point.x - start.x;
  const vy = point.y - start.y;
  const t = (vx * dx + vy * dy) / lengthSq;
  const crossTrack = (vx * dy - vy * dx) / length;
  return {
    t,
    inlandM: t * length,
    crossTrackM: crossTrack,
    lengthM: length,
  };
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function round(value: number, places = 0): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}