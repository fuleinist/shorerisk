const state = {
  model: null,
  band: 'all',
  sort: 'score',
  query: '',
};

const BAND_LABEL = { A: 'Act now', B: 'Plan', C: 'Watch', D: 'Outside' };
const BAND_ORDER = { A: 0, B: 1, C: 2, D: 3 };
const CLASS_LABEL = {
  road: 'road',
  path: 'path',
  building: 'building',
  car_park: 'car park',
  drainage: 'drainage',
  beach_access: 'beach access',
  other: 'other',
};

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value) {
  const number = Number(value) || 0;
  if (Math.abs(number) >= 1_000_000) {
    return `$${(number / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (Math.abs(number) >= 1_000) {
    return `$${Math.round(number / 1_000)}k`;
  }
  return `$${Math.round(number)}`;
}

function percent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function count(value) {
  return Math.round(Number(value) || 0).toLocaleString('en-AU');
}

function modeOf(row) {
  if (!row || !row.exposure) return 'D';
  return row.exposure.band;
}

function yearCell(row) {
  const exposure = row.exposure;
  if (exposure.alreadyExposed) return 'Exposed now';
  if (exposure.exposureYearBest === null) return '100+ yrs';
  const years = Math.max(1, Math.round(exposure.exposureYearBest));
  return `~${exposure.exposureDateBest} <span class="note">(${years} yrs)</span>`;
}

function yearValue(row) {
  const value = row.exposure.exposureYearBest;
  return value === null || value === undefined ? Number.POSITIVE_INFINITY : value;
}

function summaryStats(model) {
  const summary = model.summary;
  const items = [
    [`${summary.assessedCount}/${summary.assetCount}`, 'assets assessed'],
    [String(summary.bandCounts.A), 'in band A'],
    [String(summary.bandCounts.B), 'in band B'],
    [money(summary.valueAtRiskBandAAUD), 'replacement value, band A'],
    [percent(summary.highConfidenceShare), 'high-confidence share'],
  ];
  if (summary.routeLengthAtRiskM > 0) {
    items.push([`${count(summary.routeLengthAtRiskM)} m`, 'road and path in bands A-B']);
  }
  const container = $('stats');
  container.innerHTML = items
    .map(([value, label]) => `<div class="stat"><span class="stat-value">${esc(value)}</span><span class="stat-label">${esc(label)}</span></div>`)
    .join('');
}

function renderWarnings(model) {
  const box = $('warnings');
  if (!model.warnings || model.warnings.length === 0) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.innerHTML = `<h2>Check before you use this</h2><ul>${model.warnings
    .map((warning) => `<li>${esc(warning)}</li>`)
    .join('')}</ul>`;
}

function renderChips(model) {
  const counts = model.summary.bandCounts;
  const options = [
    ['all', `All ${model.ranked.length}`],
    ['A', `A ${counts.A}`],
    ['B', `B ${counts.B}`],
    ['C', `C ${counts.C}`],
    ['D', `D ${counts.D}`],
  ];
  $('chips').innerHTML = options
    .map(
      ([value, label]) =>
        `<button class="chip-btn" type="button" data-band="${value}" aria-pressed="${state.band === value}">${esc(label)}</button>`,
    )
    .join('');
}

function visibleRows(model) {
  const query = state.query.trim().toLowerCase();
  const rows = model.ranked.filter((row) => {
    if (state.band !== 'all' && modeOf(row) !== state.band) return false;
    if (!query) return true;
    const haystack = `${row.asset.name} ${row.asset.class} ${CLASS_LABEL[row.asset.class] ?? ''}`.toLowerCase();
    return haystack.includes(query);
  });
  const sorted = [...rows];
  if (state.sort === 'score') {
    sorted.sort((a, b) => b.score - a.score || yearValue(a) - yearValue(b));
  } else if (state.sort === 'year') {
    sorted.sort((a, b) => yearValue(a) - yearValue(b) || b.score - a.score);
  } else {
    sorted.sort((a, b) => b.asset.replacementCostAUD - a.asset.replacementCostAUD);
  }
  return sorted;
}

function detailRows(row) {
  const exposure = row.exposure;
  return `<tr class="detail" hidden>
    <td colspan="7">
      <p>${esc(exposure.note)}</p>
      <p class="note">Transect ${esc(exposure.transectId ?? 'none')}. Inland ${exposure.inlandDistanceM === null ? 'unknown' : `${Math.round(exposure.inlandDistanceM)} m`}. Best ${exposure.exposureYearBest === null ? 'beyond 100 years' : `${Math.round(exposure.exposureYearBest)} years`}. Optimistic ${exposure.exposureYearOptimistic === null ? '-' : `${Math.round(exposure.exposureYearOptimistic)} yrs`}. Pessimistic ${exposure.exposureYearPessimistic === null ? '-' : `${Math.round(exposure.exposureYearPessimistic)} yrs`}.</p>
      <h3>Adaptation options</h3>
      <ul>${row.options
        .map(
          (option) =>
            `<li><strong>${esc(option.title)}</strong> - ${esc(option.detail)} <em>${money(option.costLowAUD)} to ${money(option.costHighAUD)}, lead ${option.leadTimeYears} yrs.</em></li>`,
        )
        .join('')}</ul>
    </td>
  </tr>`;
}

function renderTable(model) {
  const rows = visibleRows(model);
  const body = $('rows');
  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="7" class="note">No asset matches this filter.</td></tr>`;
  } else {
    body.innerHTML = rows
      .map(
        (row) => `<tr class="row" data-id="${esc(row.asset.id)}" tabindex="0">
          <td class="num">${row.rank}</td>
          <td><span class="asset-name">${esc(row.asset.name)}</span><span class="asset-class">${esc(CLASS_LABEL[row.asset.class] ?? row.asset.class)}${row.asset.costIsEstimate ? ' · cost estimate' : ''}</span></td>
          <td><span class="band band-${modeOf(row).toLowerCase()}">${modeOf(row)} · ${BAND_LABEL[modeOf(row)]}</span></td>
          <td>${yearCell(row)}</td>
          <td class="num">${row.score}</td>
          <td class="num">${money(row.asset.replacementCostAUD)}</td>
          <td class="note">${esc(row.exposure.confidence)}</td>
        </tr>${detailRows(row)}`,
      )
      .join('');
  }
  const filtered = state.band !== 'all' || state.query.trim() !== '';
  $('table-note').textContent = filtered
    ? `${rows.length} of ${model.ranked.length} assessed assets shown. Select a row for the options.`
    : `${model.ranked.length} assessed assets. Select a row for the options.`;
}

function renderInterventions(model) {
  const container = $('interventions');
  if (!model.interventions || model.interventions.length === 0) {
    container.innerHTML = '<p class="note">No intervention is needed for this site.</p>';
    return;
  }
  container.innerHTML = model.interventions
    .map((item, index) => {
      const primary = item.options[0];
      const alternatives = item.options.slice(1);
      return `<article class="card">
        <h3>${index + 1}. ${esc(item.asset.name)}</h3>
        <p class="meta">${esc(CLASS_LABEL[item.asset.class] ?? item.asset.class)} · band ${modeOf(item)} · score ${item.score}/100</p>
        ${primary ? `<p><strong>${esc(primary.title)}</strong></p><p>${esc(primary.detail)}</p><p class="cost">${money(primary.costLowAUD)} to ${money(primary.costHighAUD)} · lead ${primary.leadTimeYears} yrs</p><p class="benefits">Co-benefits: ${esc(primary.coBenefits.join(', '))}.</p>` : ''}
        ${alternatives.length ? `<ul class="note">${alternatives.map((option) => `<li><strong>${esc(option.title)}</strong> - ${money(option.costLowAUD)} to ${money(option.costHighAUD)}.</li>`).join('')}</ul>` : ''}
      </article>`;
    })
    .join('');
}

function renderHeader(model) {
  document.title = `${model.siteName} - shorerisk`;
  $('site-name').textContent = model.siteName;
  const place = [model.council, model.state].filter(Boolean).join(', ');
  $('site-sub').textContent = `${place ? `${place} · ` : ''}baseline ${model.baselineYear} · generated ${new Date(model.generatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} · ${model.summary.assessedCount} assets assessed`;
  const provenance = model.provenance ?? {};
  $('provenance').textContent = `Source: ${provenance.dataset ?? provenance.source ?? 'not stated'}${provenance.licence ? `. Licence: ${provenance.licence}` : ''}. ${provenance.note ?? ''}`;
}

function render() {
  const model = state.model;
  if (!model) return;
  renderHeader(model);
  renderWarnings(model);
  summaryStats(model);
  renderChips(model);
  renderTable(model);
  renderInterventions(model);
}

function setBand(band) {
  state.band = band;
  document.querySelectorAll('.chip-btn').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.band === band));
  });
  renderTable(state.model);
}

function toggleRow(row) {
  const detail = row.nextElementSibling;
  if (!detail || !detail.classList.contains('detail')) return;
  const open = !detail.hidden;
  detail.hidden = open;
  row.classList.toggle('open', !open);
}

function wireEvents() {
  $('chips').addEventListener('click', (event) => {
    const button = event.target.closest('.chip-btn');
    if (button) setBand(button.dataset.band);
  });

  $('search').addEventListener('input', (event) => {
    state.query = event.target.value;
    renderTable(state.model);
  });

  $('sort').addEventListener('change', (event) => {
    state.sort = event.target.value;
    renderTable(state.model);
  });

  $('rows').addEventListener('click', (event) => {
    const row = event.target.closest('tr.row');
    if (row) toggleRow(row);
  });

  $('rows').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('tr.row');
    if (row) {
      event.preventDefault();
      toggleRow(row);
    }
  });
}

async function boot() {
  try {
    const response = await fetch('model.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.model = await response.json();
    render();
    wireEvents();
  } catch (error) {
    $('site-name').textContent = 'The site model did not load';
    $('site-sub').textContent = 'Run npm run build -- --site data/site-narrabeen.json --out-dir web, then reload.';
    $('stats').innerHTML = `<div class="stat"><span class="stat-value">!</span><span class="stat-label">${esc(error.message)}</span></div>`;
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

boot();