import { readFileSync } from 'node:fs';
import { distanceM } from './geo.js';
import { DataError, formatIssues, type ValidationIssue } from './errors.js';
import type {
  AssetClass,
  AssetInput,
  Certainty,
  Criticality,
  LonLat,
  SiteInput,
  TransectInput,
} from './types.js';

export const ASSET_CLASSES: readonly AssetClass[] = [
  'road',
  'path',
  'building',
  'car_park',
  'drainage',
  'beach_access',
  'other',
];

export const CRITICALITIES: readonly Criticality[] = [
  'lifeline',
  'evacuation',
  'community',
  'amenity',
];

const CERTAINTIES: readonly Certainty[] = ['good', 'ok', 'poor', 'unknown'];

export interface ValidationResult {
  site: SiteInput;
  warnings: ValidationIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    issues.push({ level: 'error', path, message: 'must be an object' });
    return null;
  }
  return value;
}

function text(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  required = false,
): string | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    if (required) {
      issues.push({ level: 'error', path: `${path}.${key}`, message: 'is required' });
    }
    return undefined;
  }
  if (typeof value !== 'string') {
    issues.push({ level: 'error', path: `${path}.${key}`, message: 'must be a string' });
    return undefined;
  }
  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    issues.push({ level: 'error', path: `${path}.${key}`, message: 'must not be empty' });
  }
  return trimmed;
}

function numberValue(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  opts: { required?: boolean; min?: number; max?: number; integer?: boolean } = {},
): number | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    if (opts.required) {
      issues.push({ level: 'error', path: `${path}.${key}`, message: 'is required' });
    }
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push({ level: 'error', path: `${path}.${key}`, message: 'must be a finite number' });
    return undefined;
  }
  if (opts.integer && !Number.isInteger(value)) {
    issues.push({ level: 'error', path: `${path}.${key}`, message: 'must be an integer' });
    return undefined;
  }
  if (opts.min !== undefined && value < opts.min) {
    issues.push({
      level: 'error',
      path: `${path}.${key}`,
      message: `must be at least ${opts.min}`,
    });
    return undefined;
  }
  if (opts.max !== undefined && value > opts.max) {
    issues.push({
      level: 'error',
      path: `${path}.${key}`,
      message: `must be at most ${opts.max}`,
    });
    return undefined;
  }
  return value;
}

function lonLat(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): LonLat | undefined {
  const value = record[key];
  const target = `${path}.${key}`;
  if (value === undefined || value === null) {
    issues.push({ level: 'error', path: target, message: 'is required' });
    return undefined;
  }
  if (!Array.isArray(value) || value.length !== 2) {
    issues.push({ level: 'error', path: target, message: 'must be [lon, lat]' });
    return undefined;
  }
  const [lon, lat] = value;
  if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)) {
    issues.push({ level: 'error', path: target, message: 'must hold two finite numbers' });
    return undefined;
  }
  if (lon < -180 || lon > 180) {
    issues.push({ level: 'error', path: target, message: 'longitude must be between -180 and 180' });
    return undefined;
  }
  if (lat < -90 || lat > 90) {
    issues.push({ level: 'error', path: target, message: 'latitude must be between -90 and 90' });
    return undefined;
  }
  return [lon, lat];
}

function enumValue<T extends string>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  allowed: readonly T[],
  issues: ValidationIssue[],
  fallback?: T,
): T | undefined {
  const value = record[key];
  const target = `${path}.${key}`;
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    issues.push({
      level: 'error',
      path: target,
      message: `must be one of ${allowed.join(', ')}`,
    });
    return fallback;
  }
  return value as T;
}

export function validateSite(raw: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const root = asRecord(raw, 'site', issues);
  if (!root) {
    throw new DataError(formatIssues(issues));
  }

  const id = text(root, 'id', 'site', issues, true) ?? '';
  const name = text(root, 'name', 'site', issues, true) ?? '';
  const council = text(root, 'council', 'site', issues);
  const state = text(root, 'state', 'site', issues);
  const baselineYear =
    numberValue(root, 'baselineYear', 'site', issues, {
      required: true,
      min: 1990,
      max: 2100,
      integer: true,
    }) ?? 0;

  const provenanceRaw = asRecord(root.provenance, 'site.provenance', issues);
  const provenance = {
    source: provenanceRaw ? text(provenanceRaw, 'source', 'site.provenance', issues, true) ?? '' : '',
    dataset: provenanceRaw ? text(provenanceRaw, 'dataset', 'site.provenance', issues) : undefined,
    retrieved: provenanceRaw ? text(provenanceRaw, 'retrieved', 'site.provenance', issues) : undefined,
    licence: provenanceRaw ? text(provenanceRaw, 'licence', 'site.provenance', issues) : undefined,
    note: provenanceRaw ? text(provenanceRaw, 'note', 'site.provenance', issues) : undefined,
  };

  const transectsRaw = root.transects;
  const transects: TransectInput[] = [];
  if (!Array.isArray(transectsRaw) || transectsRaw.length === 0) {
    issues.push({ level: 'error', path: 'site.transects', message: 'must be a non-empty array' });
  } else {
    const seen = new Set<string>();
    transectsRaw.forEach((entry, index) => {
      const path = `site.transects[${index}]`;
      const record = asRecord(entry, path, issues);
      if (!record) return;
      const tId = text(record, 'id', path, issues, true);
      if (!tId) return;
      if (seen.has(tId)) {
        issues.push({ level: 'error', path: `${path}.id`, message: `duplicate id ${tId}` });
        return;
      }
      seen.add(tId);
      const offshore = lonLat(record, 'offshore', path, issues);
      const onshore = lonLat(record, 'onshore', path, issues);
      const rate = numberValue(record, 'rateMPerYear', path, issues, {
        required: true,
        min: -20,
        max: 20,
      });
      const se = numberValue(record, 'seMPerYear', path, issues, { min: 0, max: 10 });
      const sig = numberValue(record, 'sigPValue', path, issues, { min: 0, max: 1 });
      const validObs = numberValue(record, 'validObs', path, issues, { min: 0, max: 100, integer: true });
      const validSpan = numberValue(record, 'validSpan', path, issues, { min: 0, max: 80, integer: true });
      const certainty = enumValue(record, 'certainty', path, CERTAINTIES, issues);
      if (!offshore || !onshore || rate === undefined) return;
      const length = distanceM(offshore, onshore);
      if (length < 20) {
        issues.push({
          level: 'error',
          path: `${path}.onshore`,
          message: `transect is ${length.toFixed(1)} m long; minimum is 20 m`,
        });
        return;
      }
      if (length > 2000) {
        issues.push({
          level: 'error',
          path: `${path}.onshore`,
          message: `transect is ${length.toFixed(0)} m long; maximum is 2000 m`,
        });
        return;
      }
      transects.push({
        id: tId,
        label: text(record, 'label', path, issues),
        offshore,
        onshore,
        rateMPerYear: rate,
        seMPerYear: se,
        sigPValue: sig,
        validObs,
        validSpan,
        certainty,
        source: text(record, 'source', path, issues),
      });
    });
  }

  const assetsRaw = root.assets;
  const assets: AssetInput[] = [];
  if (!Array.isArray(assetsRaw) || assetsRaw.length === 0) {
    issues.push({ level: 'error', path: 'site.assets', message: 'must be a non-empty array' });
  } else {
    const seen = new Set<string>();
    assetsRaw.forEach((entry, index) => {
      const path = `site.assets[${index}]`;
      const record = asRecord(entry, path, issues);
      if (!record) return;
      const aId = text(record, 'id', path, issues, true);
      if (!aId) return;
      if (seen.has(aId)) {
        issues.push({ level: 'error', path: `${path}.id`, message: `duplicate id ${aId}` });
        return;
      }
      seen.add(aId);
      const position = lonLat(record, 'position', path, issues);
      const cls = enumValue(record, 'class', path, ASSET_CLASSES, issues);
      if (!cls) {
        issues.push({ level: 'error', path: `${path}.class`, message: 'is required' });
        return;
      }
      const cost = numberValue(record, 'replacementCostAUD', path, issues, {
        required: true,
        min: 0,
        max: 1e10,
      });
      if (!position || cost === undefined) return;
      const asset: AssetInput = {
        id: aId,
        name: text(record, 'name', path, issues, true) ?? aId,
        class: cls,
        position,
        replacementCostAUD: cost,
        usersPerDay: numberValue(record, 'usersPerDay', path, issues, { min: 0, max: 1e7 }),
        criticality: enumValue(record, 'criticality', path, CRITICALITIES, issues),
        owner: text(record, 'owner', path, issues),
        notes: text(record, 'notes', path, issues),
        lengthM: numberValue(record, 'lengthM', path, issues, { min: 0, max: 1e6 }),
        costIsEstimate:
          typeof record.costIsEstimate === 'boolean' ? record.costIsEstimate : undefined,
      };
      if (cost === 0) {
        issues.push({
          level: 'warning',
          path: `${path}.replacementCostAUD`,
          message: 'is zero; the asset will score low on consequence',
        });
      }
      assets.push(asset);
    });
  }

  const errors = issues.filter((issue) => issue.level === 'error');
  if (errors.length > 0) {
    throw new DataError(`Site file is not valid:\n${formatIssues(errors)}`);
  }

  return {
    site: {
      id,
      name,
      council,
      state,
      baselineYear,
      provenance,
      transects,
      assets,
    },
    warnings: issues.filter((issue) => issue.level === 'warning'),
  };
}

export function parseSiteJson(text: string): ValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new DataError(`Site file is not valid JSON: ${detail}`);
  }
  return validateSite(raw);
}

export function loadSite(path: string): ValidationResult {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new DataError(`Cannot read site file ${path}: ${detail}`);
  }
  return parseSiteJson(text);
}