import { escapeHtml } from './format.js';
import { prepareSite } from './exposure.js';
import type { Band, LocalPoint, SiteInput, SiteModel } from './types.js';

const WIDTH = 960;
const HEIGHT = 640;
const PAD = 48;

const BAND_COLOUR: Record<Band, string> = {
  A: '#b3261e',
  B: '#b06000',
  C: '#2f5d7c',
  D: '#6b7780',
};

const ENVELOPE_YEARS = [20, 50, 100] as const;

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function unit(from: LocalPoint, to: LocalPoint): LocalPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: 0, y: 0 };
  return { x: dx / length, y: dy / length };
}

function extend(point: LocalPoint, direction: LocalPoint, metres: number): LocalPoint {
  return { x: point.x + direction.x * metres, y: point.y + direction.y * metres };
}

/** Sort transects along the coast so that envelope polygons do not fold. */
function orderTransects(transects: { id: string; startLocal: LocalPoint }[]): number[] {
  if (transects.length <= 2) return transects.map((_, index) => index);
  const first = transects[0];
  if (!first) return [];
  let farthest = 0;
  let best = -1;
  transects.forEach((transect, index) => {
    const distance = Math.hypot(
      transect.startLocal.x - first.startLocal.x,
      transect.startLocal.y - first.startLocal.y,
    );
    if (distance > best) {
      best = distance;
      farthest = index;
    }
  });
  const anchorA = transects[farthest];
  if (!anchorA) return transects.map((_, index) => index);
  let opposite = 0;
  let bestOpposite = -1;
  transects.forEach((transect, index) => {
    const distance = Math.hypot(
      transect.startLocal.x - anchorA.startLocal.x,
      transect.startLocal.y - anchorA.startLocal.y,
    );
    if (distance > bestOpposite) {
      bestOpposite = distance;
      opposite = index;
    }
  });
  const anchorB = transects[opposite];
  if (!anchorB) return transects.map((_, index) => index);
  const direction = unit(anchorA.startLocal, anchorB.startLocal);
  return transects
    .map((transect, index) => ({
      index,
      along: transect.startLocal.x * direction.x + transect.startLocal.y * direction.y,
    }))
    .sort((a, b) => a.along - b.along)
    .map((entry) => entry.index);
}

export function renderPlan(site: SiteInput, model: SiteModel): string {
  const prepared = prepareSite(site);
  const order = orderTransects(
    prepared.transects.map((transect) => ({ id: transect.input.id, startLocal: transect.startLocal })),
  );

  const baselines = order.map((index) => prepared.transects[index]?.startLocal).filter(Boolean) as LocalPoint[];
  const envelopes: Record<number, LocalPoint[]> = { 20: [], 50: [], 100: [] };
  for (const index of order) {
    const transect = prepared.transects[index];
    if (!transect) continue;
    const direction = unit(transect.startLocal, transect.endLocal);
    for (const years of ENVELOPE_YEARS) {
      const metres = Math.min(
        transect.erosionBestMPerYear * years,
        Math.max(0, transect.lengthM - 1),
      );
      const point = extend(transect.startLocal, direction, metres);
      envelopes[years]?.push(point);
    }
  }

  const allPoints: LocalPoint[] = [
    ...baselines,
    ...(envelopes[100] ?? []),
    ...prepared.assets.map((entry) => entry.local),
  ];
  if (allPoints.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" role="img" aria-label="Empty plan"></svg>';
  }

  const bounds: Bounds = {
    minX: Math.min(...allPoints.map((point) => point.x)),
    minY: Math.min(...allPoints.map((point) => point.y)),
    maxX: Math.max(...allPoints.map((point) => point.x)),
    maxY: Math.max(...allPoints.map((point) => point.y)),
  };
  const spanX = Math.max(60, bounds.maxX - bounds.minX);
  const spanY = Math.max(60, bounds.maxY - bounds.minY);
  const scale = Math.min((WIDTH - PAD * 2) / spanX, (HEIGHT - PAD * 2) / spanY);
  const offsetX = (WIDTH - spanX * scale) / 2 - bounds.minX * scale;
  const offsetY = (HEIGHT - spanY * scale) / 2 + bounds.maxY * scale;

  const project = (point: LocalPoint): { x: number; y: number } => ({
    x: round1(point.x * scale + offsetX),
    y: round1(-point.y * scale + offsetY),
  });

  const baselinePoints = baselines.map(project);
  const envelopePoints: Record<number, { x: number; y: number }[]> = {
    20: (envelopes[20] ?? []).map(project),
    50: (envelopes[50] ?? []).map(project),
    100: (envelopes[100] ?? []).map(project),
  };

  const seaPolygon = [
    ...baselinePoints.map((point, index) => {
      const transect = prepared.transects[order[index] ?? 0];
      const direction = transect
        ? unit(transect.startLocal, transect.endLocal)
        : { x: 1, y: 0 };
      const offshore = project(
        extend(
          { x: (point.x - offsetX) / scale, y: -(point.y - offsetY) / scale },
          { x: -direction.x, y: -direction.y },
          160,
        ),
      );
      return `${offshore.x},${offshore.y}`;
    }),
    ...[...baselinePoints].reverse().map((point) => `${point.x},${point.y}`),
  ].join(' ');

  const envelopePolygon = (years: number): string => {
    const setback = envelopePoints[years] ?? [];
    const points = [
      ...baselinePoints.map((point) => `${point.x},${point.y}`),
      ...[...setback].reverse().map((point) => `${point.x},${point.y}`),
    ];
    return points.join(' ');
  };

  const bandCount = model.summary.bandCounts;
  const legendItems: { band: Band; label: string }[] = [
    { band: 'A', label: `Act now (${bandCount.A})` },
    { band: 'B', label: `Plan (${bandCount.B})` },
    { band: 'C', label: `Watch (${bandCount.C})` },
    { band: 'D', label: `Outside 100 yrs (${bandCount.D})` },
  ];

  const assets = prepared.assets
    .map((entry) => {
      const exposure = model.exposures.find((item) => item.assetId === entry.asset.id);
      if (!exposure || exposure.assignmentGrade === 'none') return '';
      const point = project(entry.local);
      const radius = exposure.band === 'A' ? 7 : exposure.band === 'B' ? 6 : 5;
      return `<circle class="asset" cx="${point.x}" cy="${point.y}" r="${radius}" fill="${BAND_COLOUR[exposure.band]}" stroke="#ffffff" stroke-width="1.6"><title>${escapeHtml(entry.asset.name)}: band ${exposure.band}, score ${model.ranked.find((row) => row.asset.id === entry.asset.id)?.score ?? '-'}</title></circle>`;
    })
    .join('');

  const labelled = model.ranked
    .filter((row) => row.exposure.band === 'A' || row.exposure.band === 'B')
    .slice(0, 6)
    .map((row) => {
      const preparedAsset = prepared.assets.find((entry) => entry.asset.id === row.asset.id);
      if (!preparedAsset) return '';
      const point = project(preparedAsset.local);
      const label = row.asset.name.length > 30 ? `${row.asset.name.slice(0, 29)}…` : row.asset.name;
      const anchorX = Math.min(point.x + 10, WIDTH - PAD - 150);
      return `<text x="${anchorX}" y="${point.y - 9}" class="label">${escapeHtml(label)}</text>`;
    })
    .join('');

  const scaleBar = (): string => {
    const candidates = [10, 20, 50, 100, 200, 500, 1000];
    const maxPx = (WIDTH - PAD * 2) / 4;
    let chosen = candidates[0] ?? 50;
    for (const candidate of candidates) {
      if (candidate * scale <= maxPx) chosen = candidate;
    }
    const pixels = round1(chosen * scale);
    const x = PAD;
    const y = HEIGHT - 28;
    return `<g class="scale"><line x1="${x}" y1="${y}" x2="${round1(x + pixels)}" y2="${y}" /><line x1="${x}" y1="${y - 4}" x2="${x}" y2="${y + 4}" /><line x1="${round1(x + pixels)}" y1="${y - 4}" x2="${round1(x + pixels)}" y2="${y + 4}" /><text x="${round1(x + pixels / 2)}" y="${y - 8}" text-anchor="middle">${chosen} m</text></g>`;
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="${escapeHtml(`${site.name} coastal risk plan`)}">
  <title>${escapeHtml(`${site.name} coastal risk plan`)}</title>
  <style>
    .label { font: 600 11px "Segoe UI", Arial, sans-serif; fill: #14232d; paint-order: stroke; stroke: #ffffff; stroke-width: 3px; }
    .legend text { font: 11px "Segoe UI", Arial, sans-serif; fill: #14232d; }
    .scale text { font: 11px "Segoe UI", Arial, sans-serif; fill: #3d4d59; }
    .scale line { stroke: #3d4d59; stroke-width: 1.2; }
    .meta { font: 12px "Segoe UI", Arial, sans-serif; fill: #5b6b78; }
    .heading { font: 700 14px "Segoe UI", Arial, sans-serif; fill: #14232d; letter-spacing: .06em; text-transform: uppercase; }
  </style>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#f7f9fa"/>
  <polygon points="${seaPolygon}" fill="#cfe3ee" opacity="0.85"/>
  <polygon points="${envelopePolygon(100)}" fill="#2f5d7c" opacity="0.09"/>
  <polygon points="${envelopePolygon(50)}" fill="#2f5d7c" opacity="0.10"/>
  <polygon points="${envelopePolygon(20)}" fill="#2f5d7c" opacity="0.12"/>
  <polyline points="${baselinePoints.map((point) => `${point.x},${point.y}`).join(' ')}" fill="none" stroke="#1d5c78" stroke-width="2.4" stroke-dasharray="5 3"/>
  ${prepared.transects
    .map((transect) => {
      const a = project(transect.startLocal);
      const b = project(transect.endLocal);
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#7e949f" stroke-width="0.7" opacity="0.7"/>`;
    })
    .join('')}
  ${assets}
  ${labelled}
  <g class="legend" transform="translate(${WIDTH - 236}, 18)">
    <rect x="0" y="0" width="218" height="${92 + legendItems.length * 18}" fill="#ffffff" stroke="#d7dee4"/>
    <text x="12" y="20" class="heading">Risk band</text>
    ${legendItems
      .map(
        (item, index) =>
          `<circle cx="19" cy="${34 + index * 18}" r="5" fill="${BAND_COLOUR[item.band]}"/><text x="32" y="${38 + index * 18}">${escapeHtml(item.label)}</text>`,
      )
      .join('')}
    <line x1="12" y1="${44 + legendItems.length * 18}" x2="40" y2="${44 + legendItems.length * 18}" stroke="#1d5c78" stroke-width="2.2" stroke-dasharray="5 3"/>
    <text x="48" y="${48 + legendItems.length * 18}">Baseline shoreline</text>
    ${[100, 50, 20]
      .map((years, index) => {
        const opacity = years === 100 ? 0.25 : years === 50 ? 0.4 : 0.6;
        return `<rect x="12" y="${58 + legendItems.length * 18 + index * 18}" width="28" height="9" fill="#2f5d7c" opacity="${opacity}"/><text x="48" y="${67 + legendItems.length * 18 + index * 18}">${years}-year setback</text>`;
      })
      .join('')}
  </g>
  <text x="${PAD}" y="26" class="heading">${escapeHtml(site.name)}</text>
  <text x="${PAD}" y="44" class="meta">Baseline ${model.baselineYear} &middot; plan view &middot; north is up &middot; ${model.summary.assessedCount} assessed assets</text>
  ${scaleBar()}
  <text x="${WIDTH - PAD}" y="${HEIGHT - 16}" text-anchor="end" class="meta">Schematic. Not a survey drawing.</text>
</svg>`;
}