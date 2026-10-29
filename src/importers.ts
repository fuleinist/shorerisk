import { bearingDeg, distanceM, offsetPoint } from './geo.js';
import { DataError } from './errors.js';
import type { AssetClass, AssetInput, Certainty, LonLat, TransectInput } from './types.js';

export interface RatePoint {
  uid?: string;
  lon: number;
  lat: number;
  rateMPerYear: number;
  seMPerYear?: number;
  sigPValue?: number;
  validObs?: number;
  validSpan?: number;
  certainty?: Certainty;
  offshore?: LonLat;
  onshore?: LonLat;
}

export interface RateImportOptions {
  seawardBearingDeg?: number;
  transectLengthM?: number;
  idPrefix?: string;
}

export interface RateImportResult {
  transects: TransectInput[];
  notes: string[];
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function pick(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
      return record[key];
    }
  }
  return undefined;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((cell) => cell.trim() !== ''));
}

function ratePointFromRecord(record: Record<string, unknown>, index: number): RatePoint | null {
  const lon = toNumber(pick(record, ['lon', 'longitude', 'x', 'offshore_lon']));
  const lat = toNumber(pick(record, ['lat', 'latitude', 'y', 'offshore_lat']));
  const rate = toNumber(pick(record, ['rate_time', 'rate', 'rate_m_per_year']));
  if (lon === undefined || lat === undefined || rate === undefined) return null;

  const offshoreLon = toNumber(pick(record, ['offshore_lon']));
  const offshoreLat = toNumber(pick(record, ['offshore_lat']));
  const onshoreLon = toNumber(pick(record, ['onshore_lon']));
  const onshoreLat = toNumber(pick(record, ['onshore_lat']));

  return {
    uid: String(pick(record, ['uid', 'id']) ?? `T${index + 1}`),
    lon,
    lat,
    rateMPerYear: rate,
    seMPerYear: toNumber(pick(record, ['se_time', 'se', 'se_m_per_year'])),
    sigPValue: toNumber(pick(record, ['sig_time', 'sig', 'p_value'])),
    validObs: toNumber(pick(record, ['valid_obs', 'validobs'])),
    validSpan: toNumber(pick(record, ['valid_span', 'validspan'])),
    certainty: (pick(record, ['certainty']) as Certainty | undefined) ?? undefined,
    offshore:
      offshoreLon !== undefined && offshoreLat !== undefined ? [offshoreLon, offshoreLat] : undefined,
    onshore:
      onshoreLon !== undefined && onshoreLat !== undefined ? [onshoreLon, onshoreLat] : undefined,
  };
}

export function parseDeaCsv(text: string): RatePoint[] {
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header) throw new DataError('Rates CSV is empty');
  const keys = header.map((cell) => cell.trim().toLowerCase());
  const points: RatePoint[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) continue;
    const record: Record<string, unknown> = {};
    keys.forEach((key, column) => {
      record[key] = row[column];
    });
    const point = ratePointFromRecord(record, index - 1);
    if (point) points.push(point);
  }
  if (points.length === 0) {
    throw new DataError('Rates CSV has no usable rows. Check the lon, lat and rate_time columns.');
  }
  return points;
}

interface GeoJsonGeometry {
  type?: string;
  coordinates?: unknown;
}

interface GeoJsonFeature {
  type?: string;
  geometry?: GeoJsonGeometry;
  properties?: Record<string, unknown> | null;
}

export function parseDeaGeoJson(text: string): RatePoint[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new DataError(`Rates GeoJSON is not valid JSON: ${detail}`);
  }
  const collection = raw as { type?: string; features?: GeoJsonFeature[] };
  if (!collection || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new DataError('Rates file must be a GeoJSON FeatureCollection');
  }
  const points: RatePoint[] = [];
  collection.features.forEach((feature, index) => {
    const coordinates = feature.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return;
    const lon = toNumber(coordinates[0]);
    const lat = toNumber(coordinates[1]);
    if (lon === undefined || lat === undefined) return;
    const properties = feature.properties ?? {};
    const rate = toNumber(pick(properties, ['rate_time', 'rate', 'rate_m_per_year']));
    if (rate === undefined) return;
    points.push({
      uid: String(pick(properties, ['uid', 'id']) ?? `T${index + 1}`),
      lon,
      lat,
      rateMPerYear: rate,
      seMPerYear: toNumber(pick(properties, ['se_time', 'se', 'se_m_per_year'])),
      sigPValue: toNumber(pick(properties, ['sig_time', 'sig', 'p_value'])),
      validObs: toNumber(pick(properties, ['valid_obs', 'validobs'])),
      validSpan: toNumber(pick(properties, ['valid_span', 'validspan'])),
      certainty: (pick(properties, ['certainty']) as Certainty | undefined) ?? undefined,
      offshore: undefined,
      onshore: undefined,
    });
  });
  if (points.length === 0) {
    throw new DataError('Rates GeoJSON has no Point features with a rate_time property');
  }
  return points;
}

/** Order points along the coast with a farthest-pair start and a nearest walk. */
export function orderAlongCoast(points: { lon: number; lat: number }[]): number[] {
  if (points.length <= 2) return points.map((_, index) => index);
  const meanLon = points.reduce((sum, point) => sum + point.lon, 0) / points.length;
  const meanLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;

  let anchor = 0;
  let best = -1;
  points.forEach((point, index) => {
    const distance = Math.hypot(point.lon - meanLon, point.lat - meanLat);
    if (distance > best) {
      best = distance;
      anchor = index;
    }
  });

  const ordered: number[] = [];
  const used = new Set<number>();
  let current = anchor;
  while (ordered.length < points.length) {
    ordered.push(current);
    used.add(current);
    const from = points[current];
    if (!from) break;
    let next = -1;
    let nearest = Number.POSITIVE_INFINITY;
    points.forEach((point, index) => {
      if (used.has(index)) return;
      const gap = Math.hypot(point.lon - from.lon, point.lat - from.lat);
      if (gap < nearest) {
        nearest = gap;
        next = index;
      }
    });
    if (next === -1) break;
    current = next;
  }
  return ordered;
}

function bearingOfVector(x: number, y: number): number {
  return (Math.atan2(x, y) * 180) / Math.PI;
}

function angularDifference(a: number, b: number): number {
  const diff = Math.abs(((a - b + 540) % 360) - 180);
  return diff;
}

export function buildTransects(
  points: RatePoint[],
  options: RateImportOptions = {},
): RateImportResult {
  const seawardBearing = options.seawardBearingDeg ?? 90;
  const length = options.transectLengthM ?? 200;
  const prefix = options.idPrefix ?? 'T';
  const notes: string[] = [];

  const explicit = points.every((point) => point.offshore && point.onshore);
  const order = explicit ? points.map((_, index) => index) : orderAlongCoast(points);

  const transects: TransectInput[] = [];
  order.forEach((index, position) => {
    const point = points[index];
    if (!point) return;
    let offshore: LonLat;
    let onshore: LonLat;

    if (point.offshore && point.onshore) {
      offshore = point.offshore;
      onshore = point.onshore;
    } else {
      const previousIndex = order[Math.max(0, position - 1)];
      const nextIndex = order[Math.min(order.length - 1, position + 1)];
      const previous = previousIndex === undefined ? undefined : points[previousIndex];
      const next = nextIndex === undefined ? undefined : points[nextIndex];
      if (!previous || !next) return;
      const tangentX = next.lon - previous.lon;
      const tangentY = next.lat - previous.lat;
      const candidateA = bearingOfVector(tangentY, -tangentX);
      const candidateB = bearingOfVector(-tangentY, tangentX);
      const chosen =
        angularDifference(candidateA, seawardBearing) <= angularDifference(candidateB, seawardBearing)
          ? candidateA
          : candidateB;
      offshore = [point.lon, point.lat];
      onshore = offsetPoint(offshore, (chosen + 360) % 360, length);
    }

    transects.push({
      id: `${prefix}${String(position + 1).padStart(3, '0')}`,
      label: point.uid ?? `${prefix}${position + 1}`,
      offshore,
      onshore,
      rateMPerYear: point.rateMPerYear,
      seMPerYear: point.seMPerYear,
      sigPValue: point.sigPValue,
      validObs: point.validObs,
      validSpan: point.validSpan,
      certainty: point.certainty,
      source: 'DEA Coastlines rates of change',
    });
  });

  if (!explicit) {
    notes.push(
      `Transects were built from point order. Seaward bearing ${seawardBearing} degrees and length ${length} m were assumed. Check the plan before use.`,
    );
  }

  const meanRate = transects.reduce((sum, transect) => sum + transect.rateMPerYear, 0) / Math.max(1, transects.length);
  notes.push(`Mean rate is ${meanRate.toFixed(2)} m/yr over ${transects.length} transects.`);

  return { transects, notes };
}

const DEFAULT_COST: Record<AssetClass, number> = {
  road: 1_500_000,
  path: 120_000,
  building: 600_000,
  car_park: 800_000,
  drainage: 400_000,
  beach_access: 90_000,
  other: 50_000,
};

const ROAD_HIGHWAYS = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'residential',
  'unclassified',
  'service',
  'living_street',
]);

const PATH_HIGHWAYS = new Set([
  'footway',
  'path',
  'cycleway',
  'pedestrian',
  'steps',
  'bridleway',
  'track',
]);

export function classifyTags(tags: Record<string, string>): AssetClass | null {
  const highway = tags.highway;
  if (tags.man_made === 'outfall' || tags.man_made === 'culvert' || tags.inlet) return 'drainage';
  if (tags.amenity === 'parking' || tags.parking) return 'car_park';
  if (tags.leisure === 'slipway') return 'beach_access';
  if (highway && ROAD_HIGHWAYS.has(highway)) return 'road';
  if (highway && PATH_HIGHWAYS.has(highway)) return 'path';
  if (tags.building) return 'building';
  return null;
}

interface OverpassElement {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

export interface OverpassImportResult {
  assets: AssetInput[];
  skipped: number;
  notes: string[];
}

function geometryLengthM(geometry: { lat: number; lon: number }[] | undefined): number | undefined {
  if (!geometry || geometry.length < 2) return undefined;
  let total = 0;
  for (let index = 1; index < geometry.length; index += 1) {
    const previous = geometry[index - 1];
    const current = geometry[index];
    if (!previous || !current) continue;
    total += distanceM([previous.lon, previous.lat], [current.lon, current.lat]);
  }
  return Math.round(total);
}

export function parseOverpass(text: string): OverpassImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new DataError(`Overpass response is not valid JSON: ${detail}`);
  }
  const collection = raw as { elements?: OverpassElement[] };
  if (!collection || !Array.isArray(collection.elements)) {
    throw new DataError('Overpass response has no elements array');
  }

  const assets: AssetInput[] = [];
  let skipped = 0;
  const seen = new Set<string>();

  collection.elements.forEach((element, index) => {
    if (!element.tags) {
      skipped += 1;
      return;
    }
    const assetClass = classifyTags(element.tags);
    if (!assetClass) {
      skipped += 1;
      return;
    }
    const lat = element.lat ?? element.center?.lat ?? element.geometry?.[0]?.lat;
    const lon = element.lon ?? element.center?.lon ?? element.geometry?.[0]?.lon;
    if (lat === undefined || lon === undefined) {
      skipped += 1;
      return;
    }
    const baseId = `${element.type ?? 'node'}/${element.id ?? index}`;
    if (seen.has(baseId)) {
      skipped += 1;
      return;
    }
    seen.add(baseId);
    const name = element.tags.name ?? element.tags.ref ?? `${assetClass} ${element.id ?? index}`;
    assets.push({
      id: baseId.replace('/', '-'),
      name,
      class: assetClass,
      position: [lon, lat],
      replacementCostAUD: DEFAULT_COST[assetClass],
      lengthM: geometryLengthM(element.geometry),
      costIsEstimate: true,
      notes: 'Imported from OpenStreetMap. Replace the default cost with a council figure.',
    });
  });

  const notes = [
    `${assets.length} assets imported. ${skipped} elements were skipped as unmapped or without tags.`,
    'Replacement costs are class defaults. Every imported asset is marked as an estimate.',
  ];
  return { assets, skipped, notes };
}