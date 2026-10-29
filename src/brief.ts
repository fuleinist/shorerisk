import {
  escapeHtml,
  formatAUD,
  formatAUDExact,
  formatClass,
  formatCount,
  formatDate,
  formatNumber,
  formatPercent,
} from './format.js';
import type { Band, RankedAsset, SiteModel } from './types.js';

export const BAND_LABEL: Record<Band, string> = {
  A: 'Act now (0-20 yrs)',
  B: 'Plan (20-50 yrs)',
  C: 'Watch (50-100 yrs)',
  D: 'Outside 100 yrs',
};

export const BAND_SHORT: Record<Band, string> = {
  A: 'Act now',
  B: 'Plan',
  C: 'Watch',
  D: 'Outside',
};

function exposureCell(row: RankedAsset, baselineYear: number): string {
  const exposure = row.exposure;
  if (exposure.alreadyExposed) return 'Exposed now';
  if (exposure.exposureYearBest === null) return '100+ yrs';
  const years = Math.max(1, Math.round(exposure.exposureYearBest));
  return `~${baselineYear + years} <span class="muted">(${years} yrs)</span>`;
}

function row(row: RankedAsset, baselineYear: number): string {
  const exposure = row.exposure;
  const users = row.asset.usersPerDay ? formatCount(row.asset.usersPerDay) : '&mdash;';
  const estimate = row.asset.costIsEstimate ? ' <span class="flag">est.</span>' : '';
  return `
      <tr>
        <td class="num">${row.rank}</td>
        <td>
          <strong>${escapeHtml(row.asset.name)}</strong>
          <span class="muted">${escapeHtml(formatClass(row.asset.class))}${estimate}</span>
        </td>
        <td><span class="chip band-${exposure.band.toLowerCase()}">${exposure.band} &middot; ${BAND_SHORT[exposure.band]}</span></td>
        <td>${exposureCell(row, baselineYear)}</td>
        <td class="num">${row.score}</td>
        <td class="num">${formatAUD(row.asset.replacementCostAUD)}</td>
        <td class="num">${users}</td>
        <td class="confidence">${exposure.confidence}</td>
      </tr>`;
}

function interventionCard(index: number, model: SiteModel): string {
  const item = model.interventions[index];
  if (!item) return '';
  const primary = item.options[0];
  const alternatives = item.options.slice(1);
  const band = item.exposure.band;
  const altList =
    alternatives.length === 0
      ? ''
      : `<ul class="alts">${alternatives
          .map(
            (option) =>
              `<li><strong>${escapeHtml(option.title)}</strong> &mdash; ${formatAUD(option.costLowAUD)} to ${formatAUD(option.costHighAUD)}. ${escapeHtml(option.detail)}</li>`,
          )
          .join('')}</ul>`;

  return `
      <article class="card">
        <div class="card-head">
          <span class="card-number">${index + 1}</span>
          <div>
            <h3>${escapeHtml(item.asset.name)}</h3>
            <p class="muted">${escapeHtml(formatClass(item.asset.class))} &middot; rank ${item.score}/100 &middot; <span class="chip band-${band.toLowerCase()}">band ${band}</span></p>
          </div>
        </div>
        <p class="measure">Asset sits ${formatNumber(item.exposure.inlandDistanceM ?? 0, 0)} m inland. ${
          item.exposure.exposureYearBest === null
            ? 'No exposure is projected within 100 years.'
            : `Best estimate exposure in ${Math.round(item.exposure.exposureYearBest)} years (${model.baselineYear + Math.round(item.exposure.exposureYearBest)}).`
        }</p>
        ${
          primary
            ? `<p><strong>${escapeHtml(primary.title)}</strong></p>
        <p>${escapeHtml(primary.detail)}</p>
        <p class="cost">${formatAUDExact(primary.costLowAUD)} to ${formatAUDExact(primary.costHighAUD)} &middot; lead time ${formatNumber(primary.leadTimeYears, 1)} yrs</p>
        <p class="benefits">Co-benefits: ${primary.coBenefits.map(escapeHtml).join(', ')}.</p>`
            : ''
        }
        ${altList}
      </article>`;
}

function warningsBlock(model: SiteModel): string {
  if (model.warnings.length === 0) return '';
  return `
    <section class="warnings">
      <h2>Check before you use this</h2>
      <ul>${model.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>
    </section>`;
}

function statsBlock(model: SiteModel): string {
  const summary = model.summary;
  const stats: { value: string; label: string }[] = [
    { value: `${summary.assessedCount}/${summary.assetCount}`, label: 'assets assessed' },
    { value: String(summary.bandCounts.A), label: 'in band A' },
    { value: String(summary.bandCounts.B), label: 'in band B' },
    { value: formatAUD(summary.valueAtRiskBandAAUD), label: 'replacement value, band A' },
    { value: formatPercent(summary.highConfidenceShare), label: 'high-confidence share' },
  ];
  if (summary.routeLengthAtRiskM > 0) {
    stats.push({
      value: `${formatCount(summary.routeLengthAtRiskM)} m`,
      label: 'road and path in bands A-B',
    });
  }
  return stats
    .map(
      (stat) => `<div class="stat"><span class="stat-value">${escapeHtml(stat.value)}</span><span class="stat-label">${escapeHtml(stat.label)}</span></div>`,
    )
    .join('');
}

function meaning(model: SiteModel): string {
  const summary = model.summary;
  const sentences: string[] = [];
  if (summary.bandCounts.A === 0) {
    sentences.push('No asset is in band A. No asset is likely to meet the shoreline within 20 years.');
  } else {
    sentences.push(
      `${summary.bandCounts.A} asset${summary.bandCounts.A === 1 ? '' : 's'} sit in band A. These may meet the shoreline within 20 years.`,
    );
    sentences.push(
      `Their combined replacement value is ${formatAUDExact(summary.valueAtRiskBandAAUD)}.`,
    );
  }
  if (summary.bandCounts.B > 0) {
    sentences.push(
      `${summary.bandCounts.B} more fall in band B. They need a plan, not an emergency works order.`,
    );
  }
  if (summary.unassignedCount > 0) {
    sentences.push(
      `${summary.unassignedCount} assets are outside the transect corridor. Add transects before you rank them.`,
    );
  }
  sentences.push('Confirm the costs and the options with a coastal engineer before a council brief.');
  return sentences.join(' ');
}

export function renderBrief(model: SiteModel): string {
  const shown = model.ranked.slice(0, 12);
  const moreCount = model.ranked.length - shown.length;
  const place = [model.council, model.state].filter(Boolean).join(', ');
  const title = `${model.siteName} coastal asset risk brief`;

  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --ink: #14232d;
    --muted: #5b6b78;
    --rule: #d7dee4;
    --paper: #ffffff;
    --wash: #f4f7f9;
    --a: #b3261e;
    --b: #b06000;
    --c: #2f5d7c;
    --d: #6b7780;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--wash);
    color: var(--ink);
    font: 15px/1.5 "Segoe UI", -apple-system, Roboto, Helvetica, Arial, sans-serif;
  }
  .brief {
    background: var(--paper);
    max-width: 980px;
    margin: 24px auto;
    padding: 40px 44px 32px;
    box-shadow: 0 8px 30px rgba(16, 32, 44, .10);
  }
  .kicker {
    text-transform: uppercase;
    letter-spacing: .14em;
    font-size: 11px;
    font-weight: 700;
    color: var(--c);
  }
  h1 { font-size: 30px; line-height: 1.15; margin: 6px 0 4px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .08em; margin: 30px 0 10px; color: var(--c); }
  h3 { font-size: 16px; margin: 0 0 2px; }
  p { margin: 0 0 10px; }
  .sub { color: var(--muted); }
  .provenance { font-size: 12px; color: var(--muted); border-top: 1px solid var(--rule); padding-top: 10px; margin-top: 14px; }
  .warnings {
    margin-top: 22px;
    border-left: 4px solid var(--a);
    background: #fdf3f2;
    padding: 12px 16px;
  }
  .warnings h2 { margin: 0 0 6px; color: var(--a); }
  .warnings ul { margin: 0; padding-left: 18px; }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px;
    margin: 22px 0 6px;
  }
  .stat { background: var(--wash); border: 1px solid var(--rule); padding: 12px 14px; }
  .stat-value { display: block; font-size: 24px; font-weight: 700; line-height: 1.2; }
  .stat-label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); border-bottom: 2px solid var(--rule); padding: 6px 8px; }
  td { border-bottom: 1px solid var(--rule); padding: 8px; vertical-align: top; }
  td.num, th.num { text-align: right; }
  td .muted { display: block; font-size: 11px; color: var(--muted); }
  .muted { color: var(--muted); font-size: 12px; }
  .chip { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 10px; font-weight: 700; color: #fff; white-space: nowrap; }
  .band-a { background: var(--a); }
  .band-b { background: var(--b); }
  .band-c { background: var(--c); }
  .band-d { background: var(--d); }
  .flag { font-size: 10px; color: var(--b); font-weight: 700; }
  .confidence { text-transform: capitalize; color: var(--muted); }
  .note { font-size: 11px; color: var(--muted); margin-top: 8px; }
  .cards { display: grid; gap: 12px; }
  .card { border: 1px solid var(--rule); border-left: 4px solid var(--c); padding: 14px 16px; }
  .card-head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 8px; }
  .card-number { font-size: 22px; font-weight: 700; color: var(--c); line-height: 1; }
  .measure { font-size: 13px; color: var(--muted); }
  .cost { font-weight: 700; }
  .benefits { font-size: 12px; color: var(--muted); }
  .alts { margin: 8px 0 0; padding-left: 18px; font-size: 12px; color: var(--muted); }
  ul, ol { margin: 0 0 10px; padding-left: 20px; }
  li { margin-bottom: 5px; }
  footer { margin-top: 30px; border-top: 1px solid var(--rule); padding-top: 12px; font-size: 11px; color: var(--muted); }
  @media print {
    body { background: #fff; font-size: 10.5pt; }
    .brief { box-shadow: none; margin: 0; max-width: none; padding: 0; }
    .page-break { break-before: page; }
    h2 { break-after: avoid; }
    tr, .card { break-inside: avoid; }
  }
</style>
</head>
<body>
<main class="brief">
  <header>
    <div class="kicker">Coastal asset risk brief</div>
    <h1>${escapeHtml(model.siteName)}</h1>
    <p class="sub">${escapeHtml(place || 'Location not stated')} &middot; baseline ${model.baselineYear} &middot; generated ${formatDate(model.generatedAt)}</p>
    <p class="provenance">Shoreline rates: ${escapeHtml(model.provenance.dataset ?? model.provenance.source)}${
      model.provenance.licence ? ` (${escapeHtml(model.provenance.licence)}).` : '.'
    } ${escapeHtml(model.provenance.note ?? '')}</p>
  </header>
${warningsBlock(model)}
  <section class="stats">${statsBlock(model)}</section>

  <section>
    <h2>What this means</h2>
    <p>${escapeHtml(meaning(model))}</p>
  </section>

  <section>
    <h2>Ranked assets</h2>
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>Asset</th>
          <th>Band</th>
          <th>Exposure</th>
          <th class="num">Score</th>
          <th class="num">Replacement</th>
          <th class="num">Users/day</th>
          <th>Confidence</th>
        </tr>
      </thead>
      <tbody>${shown.map((item) => row(item, model.baselineYear)).join('')}
      </tbody>
    </table>
    <p class="note">Score = 0.6 &times; urgency + 0.4 &times; consequence. Urgency is set by the band. Consequence combines replacement cost, daily users and criticality.${moreCount > 0 ? ` Showing the top ${shown.length} of ${model.ranked.length} assessed assets.` : ''}</p>
  </section>

  <section class="page-break">
    <h2>Priority interventions</h2>
    <div class="cards">${[0, 1, 2].map((index) => interventionCard(index, model)).join('')}
    </div>
  </section>

  <section>
    <h2>Method</h2>
    <ol>
      <li>Each asset is matched to the nearest shoreline transect. The inland distance is measured along that transect from the baseline shoreline.</li>
      <li>The setback at a given year is the retreat rate multiplied by the number of years. A negative rate means retreat.</li>
      <li>Bands: A is 0 to 20 years, B is 20 to 50, C is 50 to 100, and D is beyond 100 years or no retreat.</li>
      <li>The 95% confidence range uses the standard error of the rate. It sets the optimistic and pessimistic years.</li>
      <li>Confidence combines the transect data grade and the cross-shore offset of the asset.</li>
    </ol>
  </section>

  <section>
    <h2>Limits</h2>
    <ul>
      <li>The rate is historical. It is not a forecast.</li>
      <li>The model assumes a constant rate. Storms, wave run-up and sea level acceleration are not included.</li>
      <li>Transects are straight lines. They cover a 60 m wide corridor.</li>
      <li>Costs are order-of-cost in 2026 AUD. An engineer must confirm them.</li>
      <li>Rocky coasts, headlands and estuaries are outside the rate product.</li>
      <li>This brief is a screening aid. It is not a coastal hazard assessment or a statutory plan.</li>
    </ul>
  </section>

  <footer>
    ${escapeHtml(model.provenance.source)}${model.provenance.retrieved ? ` &middot; data retrieved ${escapeHtml(model.provenance.retrieved)}` : ''} &middot; shorerisk v0.1 &middot; MIT licence
  </footer>
</main>
</body>
</html>
`;
}