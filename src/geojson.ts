import { round } from './geo.js';
import type { AssetClass, SiteInput, SiteModel } from './types.js';

export interface GeoJsonFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: Record<string, string | number | boolean | null>;
}

export interface GeoJsonCollection {
  type: 'FeatureCollection';
  name: string;
  features: GeoJsonFeature[];
}

export function toGeoJson(site: SiteInput, model: SiteModel): GeoJsonCollection {
  const rankedById = new Map(model.ranked.map((row) => [row.asset.id, row]));
  const features: GeoJsonFeature[] = site.assets.map((asset) => {
    const exposure = model.exposures.find((item) => item.assetId === asset.id);
    const ranked = rankedById.get(asset.id);
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [round(asset.position[0], 7), round(asset.position[1], 7)],
      },
      properties: {
        id: asset.id,
        name: asset.name,
        class: asset.class satisfies AssetClass,
        assessed: exposure ? exposure.assignmentGrade !== 'none' : false,
        band: exposure ? exposure.band : null,
        score: ranked ? ranked.score : null,
        exposure_year: exposure ? exposure.exposureYearBest : null,
        exposure_date: exposure ? exposure.exposureDateBest : null,
        inland_m: exposure ? exposure.inlandDistanceM : null,
        confidence: exposure ? exposure.confidence : null,
        replacement_cost_aud: asset.replacementCostAUD,
        cost_is_estimate: Boolean(asset.costIsEstimate),
        users_per_day: asset.usersPerDay ?? null,
        length_m: asset.lengthM ?? null,
        owner: asset.owner ?? null,
        transect_id: exposure ? exposure.transectId : null,
      },
    };
  });

  return {
    type: 'FeatureCollection',
    name: `${site.id}-coastal-assets`,
    features,
  };
}