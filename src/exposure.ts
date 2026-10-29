import { distanceM, projectOntoTransect, projectionFor, round, type Projection } from './geo.js';
import type {
  AssetInput,
  Band,
  Certainty,
  ExposureResult,
  Grade,
  LocalPoint,
  PreparedTransect,
  SiteInput,
  TransectInput,
} from './types.js';

export const DEFAULT_HORIZON_YEARS = 100;
export const CROSS_TRACK_GATE_M = 60;
const CI_Z = 1.96;

const GRADE_RANK: Record<Grade, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const CERTAINTY_GRADE: Record<Certainty, Exclude<Grade, 'none'> | null> = {
  good: 'high',
  ok: 'medium',
  poor: 'low',
  unknown: null,
};

export function getGradeRank(grade: Grade): number {
  return GRADE_RANK[grade];
}

export function lowerGrade(a: Grade, b: Grade): Grade {
  return GRADE_RANK[a] <= GRADE_RANK[b] ? a : b;
}

export function prepareTransect(input: TransectInput, projection: Projection): PreparedTransect {
  const lengthM = distanceM(input.offshore, input.onshore);
  const rate = input.rateMPerYear;
  const se = Math.max(0, input.seMPerYear ?? 0);
  const erosionBest = Math.max(0, -rate);
  const erosionOptimistic = Math.max(0, -(rate + CI_Z * se));
  const erosionPessimistic = Math.max(0, -(rate - CI_Z * se));

  const span = input.validSpan;
  const sig = input.sigPValue;
  let computed: Exclude<Grade, 'none'> = 'low';
  let gradeNote: string | undefined;
  if (sig === undefined || span === undefined) {
    gradeNote = 'Rate has no significance value or observation span.';
  } else if (sig <= 0.01 && span >= 20) {
    computed = 'high';
  } else if (sig <= 0.05 && span >= 10) {
    computed = 'medium';
  } else {
    gradeNote = `Rate is weak (p=${sig.toFixed(3)}, span ${span} years).`;
  }

  const sourceGrade = input.certainty ? CERTAINTY_GRADE[input.certainty] : null;
  let dataGrade: Exclude<Grade, 'none'> = computed;
  if (sourceGrade && GRADE_RANK[sourceGrade] < GRADE_RANK[computed]) {
    dataGrade = sourceGrade;
    gradeNote = `Source marks this transect as ${input.certainty}.`;
  }

  return {
    input,
    startLocal: projection.toLocal(input.offshore),
    endLocal: projection.toLocal(input.onshore),
    lengthM,
    erosionBestMPerYear: erosionBest,
    erosionOptimisticMPerYear: erosionOptimistic,
    erosionPessimisticMPerYear: erosionPessimistic,
    dataGrade,
    gradeNote,
  };
}

export interface PreparedSite {
  projection: Projection;
  transects: PreparedTransect[];
  assets: { asset: AssetInput; local: LocalPoint }[];
}

function centroid(points: readonly (readonly [number, number])[]): readonly [number, number] {
  if (points.length === 0) return [0, 0];
  let lon = 0;
  let lat = 0;
  for (const point of points) {
    lon += point[0];
    lat += point[1];
  }
  return [lon / points.length, lat / points.length];
}

export function prepareSite(site: SiteInput): PreparedSite {
  const origin = centroid(site.transects.map((transect) => transect.offshore));
  const projection = projectionFor(origin);
  return {
    projection,
    transects: site.transects.map((transect) => prepareTransect(transect, projection)),
    assets: site.assets.map((asset) => ({
      asset,
      local: projection.toLocal(asset.position),
    })),
  };
}

export function bandForYear(year: number | null, horizonYears = DEFAULT_HORIZON_YEARS): Band {
  if (year === null) return 'D';
  if (year <= 20) return 'A';
  if (year <= 50) return 'B';
  if (year <= horizonYears) return 'C';
  return 'D';
}

export function bandRank(band: Band): number {
  return { A: 0, B: 1, C: 2, D: 3 }[band];
}

export interface ExposureOptions {
  horizonYears?: number;
  crossTrackGateM?: number;
  baselineYear?: number;
}

export function unassigned(assetId: string, gate: number): ExposureResult {
  return {
    assetId,
    transectId: null,
    inlandDistanceM: null,
    crossTrackM: null,
    assignmentGrade: 'none',
    dataGrade: 'low',
    confidence: 'none',
    alreadyExposed: false,
    exposureYearBest: null,
    exposureYearOptimistic: null,
    exposureYearPessimistic: null,
    exposureDateBest: null,
    band: 'D',
    uncertain: false,
    note: `No transect covers this asset within ${gate} m of the line. The asset is not assessed.`,
  };
}

export function assessAsset(
  asset: AssetInput,
  local: LocalPoint,
  prepared: PreparedTransect[],
  options: ExposureOptions = {},
): ExposureResult {
  const horizon = options.horizonYears ?? DEFAULT_HORIZON_YEARS;
  const gate = options.crossTrackGateM ?? CROSS_TRACK_GATE_M;

  let best: { transect: PreparedTransect; inlandM: number; crossM: number } | null = null;
  for (const transect of prepared) {
    const projection = projectOntoTransect(local, transect.startLocal, transect.endLocal);
    if (projection.t > 1.0) continue;
    // Allow a short seaward band so that assets at the waterline are still assessed.
    if (projection.inlandM < -30) continue;
    const cross = Math.abs(projection.crossTrackM);
    if (cross > gate) continue;
    if (!best || cross < Math.abs(best.crossM)) {
      best = { transect, inlandM: projection.inlandM, crossM: projection.crossTrackM };
    }
  }

  if (!best) {
    return unassigned(asset.id, gate);
  }

  const { transect, inlandM } = best;
  const crossAbs = Math.abs(best.crossM);
  const assignmentGrade: Grade = crossAbs <= 15 ? 'high' : crossAbs <= 30 ? 'medium' : 'low';
  const confidence = lowerGrade(assignmentGrade, transect.dataGrade);

  const base = {
    assetId: asset.id,
    transectId: transect.input.id,
    inlandDistanceM: round(inlandM, 1),
    crossTrackM: round(best.crossM, 1),
    assignmentGrade,
    dataGrade: transect.dataGrade,
    confidence,
    alreadyExposed: inlandM <= 0,
  };

  const baselineYear = options.baselineYear ?? 2026;
  const label = transect.input.label ?? transect.input.id;

  if (inlandM <= 0) {
    return {
      ...base,
      exposureYearBest: 0,
      exposureYearOptimistic: 0,
      exposureYearPessimistic: 0,
      exposureDateBest: baselineYear,
      band: 'A',
      uncertain: false,
      note: `${label}: the asset sits at or seaward of the baseline shoreline.`,
    };
  }

  const yearFor = (erosionMPerYear: number): number | null =>
    erosionMPerYear > 0 ? inlandM / erosionMPerYear : null;

  const yearBest = yearFor(transect.erosionBestMPerYear);
  const yearOptimistic = yearFor(transect.erosionOptimisticMPerYear);
  const yearPessimistic = yearFor(transect.erosionPessimisticMPerYear);

  const band = bandForYear(yearBest, horizon);
  const pessimisticBand = bandForYear(yearPessimistic, horizon);
  const uncertain = yearPessimistic !== null && bandRank(pessimisticBand) < bandRank(band);

  const trend =
    transect.erosionBestMPerYear > 0
      ? `retreats ${round(transect.erosionBestMPerYear, 2)} m/yr`
      : 'shows no retreat';
  const timing =
    yearBest === null
      ? 'No exposure is projected within the rate record.'
      : `Best estimate exposure in ${Math.round(yearBest)} years (${baselineYear + Math.round(yearBest)}).`;

  return {
    ...base,
    exposureYearBest: yearBest === null ? null : round(yearBest, 1),
    exposureYearOptimistic: yearOptimistic === null ? null : round(yearOptimistic, 1),
    exposureYearPessimistic: yearPessimistic === null ? null : round(yearPessimistic, 1),
    exposureDateBest: yearBest === null ? null : baselineYear + Math.round(yearBest),
    band,
    uncertain,
    note: `${label}: ${trend}. Asset is ${Math.round(inlandM)} m inland. ${timing}`,
  };
}

export function assessSite(site: SiteInput, options: ExposureOptions = {}): ExposureResult[] {
  const prepared = prepareSite(site);
  return prepared.assets.map(({ asset, local }) =>
    assessAsset(asset, local, prepared.transects, {
      ...options,
      baselineYear: options.baselineYear ?? site.baselineYear,
    }),
  );
}