import { clamp, round } from './geo.js';
import { optionsFor } from './adapt.js';
import type {
  AssetClass,
  AssetInput,
  Band,
  Criticality,
  ExposureResult,
  RankedAsset,
  SiteInput,
  Summary,
} from './types.js';

export const URGENCY_SCORE: Record<Band, number> = {
  A: 100,
  B: 65,
  C: 35,
  D: 10,
};

export const CRITICALITY_FACTOR: Record<Criticality, number> = {
  lifeline: 1.0,
  evacuation: 0.85,
  community: 0.65,
  amenity: 0.4,
};

export const DEFAULT_CRITICALITY: Record<AssetClass, Criticality> = {
  road: 'lifeline',
  drainage: 'lifeline',
  path: 'amenity',
  building: 'community',
  car_park: 'amenity',
  beach_access: 'amenity',
  other: 'amenity',
};

export function criticalityOf(asset: AssetInput): Criticality {
  return asset.criticality ?? DEFAULT_CRITICALITY[asset.class];
}

export function costFactor(costAUD: number): number {
  const safe = Math.max(costAUD, 1);
  return clamp(Math.log10(safe / 10_000) / 3, 0, 1);
}

export function userFactor(usersPerDay = 0): number {
  const safe = Math.max(usersPerDay, 0);
  return clamp(Math.log10(safe + 1) / Math.log10(5001), 0, 1);
}

export function consequenceOf(asset: AssetInput): number {
  const factor = CRITICALITY_FACTOR[criticalityOf(asset)];
  const value = 100 * (0.5 * costFactor(asset.replacementCostAUD) + 0.3 * userFactor(asset.usersPerDay) + 0.2 * factor);
  return round(value, 1);
}

export function scoreOf(asset: AssetInput, band: Band): {
  urgency: number;
  consequence: number;
  score: number;
} {
  const urgency = URGENCY_SCORE[band];
  const consequence = consequenceOf(asset);
  return { urgency, consequence, score: Math.round(0.6 * urgency + 0.4 * consequence) };
}

export function rankAssets(site: SiteInput, exposures: ExposureResult[]): RankedAsset[] {
  const assetsById = new Map(site.assets.map((asset) => [asset.id, asset]));
  const rows: Omit<RankedAsset, 'rank'>[] = [];
  for (const exposure of exposures) {
    if (exposure.assignmentGrade === 'none') continue;
    const asset = assetsById.get(exposure.assetId);
    if (!asset) continue;
    const { urgency, consequence, score } = scoreOf(asset, exposure.band);
    rows.push({
      asset,
      exposure,
      urgency,
      consequence,
      score,
      options: optionsFor(asset.class, exposure.band),
    });
  }

  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const yearA = a.exposure.exposureYearBest ?? Number.POSITIVE_INFINITY;
    const yearB = b.exposure.exposureYearBest ?? Number.POSITIVE_INFINITY;
    if (yearA !== yearB) return yearA - yearB;
    if (b.asset.replacementCostAUD !== a.asset.replacementCostAUD) {
      return b.asset.replacementCostAUD - a.asset.replacementCostAUD;
    }
    return a.asset.name.localeCompare(b.asset.name);
  });

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function summarise(
  site: SiteInput,
  exposures: ExposureResult[],
  ranked: RankedAsset[],
): Summary {
  const bandCounts = { A: 0, B: 0, C: 0, D: 0 };
  let assessedCount = 0;
  let highConfidence = 0;
  let alreadyExposedCount = 0;
  let uncertainCount = 0;
  let valueAtRiskBandAAUD = 0;
  let valueAtRiskBandABAUD = 0;
  let routeLengthAtRiskM = 0;

  for (const exposure of exposures) {
    if (exposure.assignmentGrade === 'none') continue;
    assessedCount += 1;
    bandCounts[exposure.band] += 1;
    if (exposure.confidence === 'high') highConfidence += 1;
    if (exposure.alreadyExposed) alreadyExposedCount += 1;
    if (exposure.uncertain) uncertainCount += 1;
  }

  for (const row of ranked) {
    const cost = row.asset.replacementCostAUD;
    if (row.exposure.band === 'A') valueAtRiskBandAAUD += cost;
    if (row.exposure.band === 'A' || row.exposure.band === 'B') {
      valueAtRiskBandABAUD += cost;
      if (row.asset.class === 'road' || row.asset.class === 'path') {
        routeLengthAtRiskM += row.asset.lengthM ?? 0;
      }
    }
  }

  const total = site.assets.length;
  return {
    assetCount: total,
    assessedCount,
    unassignedCount: total - assessedCount,
    bandCounts,
    valueAtRiskBandAAUD: round(valueAtRiskBandAAUD),
    valueAtRiskBandABAUD: round(valueAtRiskBandABAUD),
    routeLengthAtRiskM: round(routeLengthAtRiskM),
    highConfidenceShare: assessedCount === 0 ? 0 : round(highConfidence / assessedCount, 3),
    assessedShare: total === 0 ? 0 : round(assessedCount / total, 3),
    alreadyExposedCount,
    uncertainCount,
  };
}