import { topInterventions } from './adapt.js';
import { assessSite } from './exposure.js';
import { rankAssets, summarise } from './rank.js';
import type { SiteInput, SiteModel } from './types.js';

export interface BuildOptions {
  baselineYear?: number;
  horizonYears?: number;
  now?: Date;
}

export function buildModel(site: SiteInput, options: BuildOptions = {}): SiteModel {
  const baselineYear = options.baselineYear ?? site.baselineYear;
  const horizonYears = options.horizonYears ?? 100;
  const exposures = assessSite(site, { baselineYear, horizonYears });
  const ranked = rankAssets(site, exposures);
  const summary = summarise(site, exposures, ranked);
  const interventions = topInterventions(ranked, 3);
  const generatedAt = options.now ? options.now.toISOString() : new Date().toISOString();

  const warnings: string[] = [];
  const provenanceText = `${site.provenance.source} ${site.provenance.dataset ?? ''} ${site.provenance.note ?? ''}`;
  if (/sample|example|illustrative/i.test(provenanceText)) {
    warnings.push(
      'This site uses sample data. Replace it with a DEA Coastlines export before any decision.',
    );
  }
  if (summary.unassignedCount > 0) {
    warnings.push(
      `${summary.unassignedCount} assets are more than 60 m from a transect. They are not assessed.`,
    );
  }
  if (summary.assessedCount > 0 && summary.highConfidenceShare < 0.5) {
    warnings.push(
      `Only ${Math.round(summary.highConfidenceShare * 100)}% of assessed assets have high confidence.`,
    );
  }
  if (summary.uncertainCount > 0) {
    warnings.push(
      `${summary.uncertainCount} assets could fall in an earlier band under the 95% confidence case.`,
    );
  }
  if (summary.alreadyExposedCount > 0) {
    warnings.push(
      `${summary.alreadyExposedCount} assets sit at or seaward of the baseline shoreline.`,
    );
  }

  return {
    siteId: site.id,
    siteName: site.name,
    council: site.council,
    state: site.state,
    baselineYear,
    horizonYears,
    generatedAt,
    provenance: site.provenance,
    exposures,
    ranked,
    interventions,
    summary,
    warnings,
  };
}