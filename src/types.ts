export type LonLat = readonly [number, number];

export interface LocalPoint {
  x: number;
  y: number;
}

export type AssetClass =
  | 'road'
  | 'path'
  | 'building'
  | 'car_park'
  | 'drainage'
  | 'beach_access'
  | 'other';

export type Criticality = 'lifeline' | 'evacuation' | 'community' | 'amenity';

export type Band = 'A' | 'B' | 'C' | 'D';

export type Grade = 'high' | 'medium' | 'low' | 'none';

export type Certainty = 'good' | 'ok' | 'poor' | 'unknown';

export interface TransectInput {
  id: string;
  label?: string;
  /** Start point on the most recent observed shoreline. */
  offshore: LonLat;
  /** End point inland of the start point. */
  onshore: LonLat;
  /** Metres per year. Negative values mean retreat. */
  rateMPerYear: number;
  /** Standard error of the rate, metres per year. */
  seMPerYear?: number;
  /** p-value of the shoreline distance trend. */
  sigPValue?: number;
  validObs?: number;
  validSpan?: number;
  certainty?: Certainty;
  source?: string;
}

export interface AssetInput {
  id: string;
  name: string;
  class: AssetClass;
  position: LonLat;
  replacementCostAUD: number;
  usersPerDay?: number;
  criticality?: Criticality;
  owner?: string;
  notes?: string;
  /** Length of a linear asset such as a road or path, metres. */
  lengthM?: number;
  /** True when the cost is a class default, not a council figure. */
  costIsEstimate?: boolean;
}

export interface Provenance {
  source: string;
  dataset?: string;
  retrieved?: string;
  licence?: string;
  note?: string;
}

export interface SiteInput {
  id: string;
  name: string;
  council?: string;
  state?: string;
  /** First year of the shoreline rate period. Exposure years count from here. */
  baselineYear: number;
  provenance: Provenance;
  transects: TransectInput[];
  assets: AssetInput[];
}

export interface PreparedTransect {
  input: TransectInput;
  /** Start point in the site local plane. */
  startLocal: LocalPoint;
  /** End point in the site local plane. */
  endLocal: LocalPoint;
  lengthM: number;
  /** Metres of retreat per year, best estimate. Zero for stable or growing coasts. */
  erosionBestMPerYear: number;
  erosionOptimisticMPerYear: number;
  erosionPessimisticMPerYear: number;
  dataGrade: Exclude<Grade, 'none'>;
  /** Why the grade was lowered, if it was. */
  gradeNote?: string;
}

export interface ExposureResult {
  assetId: string;
  transectId: string | null;
  inlandDistanceM: number | null;
  crossTrackM: number | null;
  assignmentGrade: Grade;
  dataGrade: Exclude<Grade, 'none'>;
  confidence: Grade;
  alreadyExposed: boolean;
  /** Years after the baseline year. Null when no retreat is projected. */
  exposureYearBest: number | null;
  exposureYearOptimistic: number | null;
  exposureYearPessimistic: number | null;
  /** Calendar year of best-estimate exposure. Null when none. */
  exposureDateBest: number | null;
  band: Band;
  /** Set when the pessimistic case is at least one band sooner than the best case. */
  uncertain: boolean;
  note: string;
}

export interface RankedAsset {
  rank: number;
  asset: AssetInput;
  exposure: ExposureResult;
  urgency: number;
  consequence: number;
  score: number;
  options: AdaptationOption[];
}

export interface AdaptationOption {
  id: string;
  title: string;
  detail: string;
  costLowAUD: number;
  costHighAUD: number;
  leadTimeYears: number;
  coBenefits: string[];
}

export interface Intervention {
  asset: AssetInput;
  exposure: ExposureResult;
  score: number;
  options: AdaptationOption[];
  costLowAUD: number;
  costHighAUD: number;
}

export interface BandCounts {
  A: number;
  B: number;
  C: number;
  D: number;
}

export interface Summary {
  assetCount: number;
  assessedCount: number;
  unassignedCount: number;
  bandCounts: BandCounts;
  /** Replacement value of assets in band A. */
  valueAtRiskBandAAUD: number;
  /** Replacement value of assets in bands A and B. */
  valueAtRiskBandABAUD: number;
  /** Metres of road and path in bands A and B. */
  routeLengthAtRiskM: number;
  highConfidenceShare: number;
  assessedShare: number;
  alreadyExposedCount: number;
  uncertainCount: number;
}

export interface SiteModel {
  siteId: string;
  siteName: string;
  council?: string;
  state?: string;
  baselineYear: number;
  horizonYears: number;
  generatedAt: string;
  provenance: Provenance;
  exposures: ExposureResult[];
  ranked: RankedAsset[];
  interventions: Intervention[];
  summary: Summary;
  warnings: string[];
}