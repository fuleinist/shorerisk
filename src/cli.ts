#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderBrief, BAND_LABEL } from './brief.js';
import { DataError, UsageError, formatIssues, type ValidationIssue } from './errors.js';
import { formatAUD, formatClass, formatCount, formatNumber, formatPercent } from './format.js';
import { buildModel } from './model.js';
import { renderPlan } from './plan.js';
import { toGeoJson } from './geojson.js';
import { loadSite, parseSiteJson, validateSite } from './site.js';
import {
  buildTransects,
  parseDeaCsv,
  parseDeaGeoJson,
  parseOverpass,
  type RatePoint,
} from './importers.js';
import type { SiteInput, SiteModel } from './types.js';

interface ParsedArgs {
  command: string;
  values: Map<string, string>;
  flags: Set<string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = '', ...rest] = argv;
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token || !token.startsWith('--')) {
      throw new UsageError(`Unexpected argument: ${token ?? ''}`);
    }
    const body = token.slice(2);
    const equals = body.indexOf('=');
    if (equals !== -1) {
      values.set(body.slice(0, equals), body.slice(equals + 1));
      continue;
    }
    const next = rest[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      values.set(body, next);
      index += 1;
    } else {
      flags.add(body);
    }
  }
  return { command, values, flags };
}

function need(args: ParsedArgs, key: string): string {
  const value = args.values.get(key);
  if (value === undefined) {
    throw new UsageError(`Missing required option --${key}`);
  }
  return value;
}

function optionalNumber(args: ParsedArgs, key: string): number | undefined {
  const raw = args.values.get(key);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new UsageError(`--${key} must be a number`);
  }
  return value;
}

function writeOut(path: string, content: string): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

const pad = (value: string | number, width: number): string => String(value).padEnd(width);

function printModel(model: SiteModel): void {
  const summary = model.summary;
  console.log(`${model.siteName}${model.council ? ` (${model.council})` : ''}`);
  console.log(`Baseline ${model.baselineYear}. Horizon ${model.horizonYears} years.`);
  console.log(
    `${summary.assessedCount} of ${summary.assetCount} assets assessed. ${summary.unassignedCount} unassigned.`,
  );
  console.log(
    `Bands: A ${summary.bandCounts.A}, B ${summary.bandCounts.B}, C ${summary.bandCounts.C}, D ${summary.bandCounts.D}`,
  );
  console.log(
    `Value in band A: ${formatAUD(summary.valueAtRiskBandAAUD)}. Bands A-B: ${formatAUD(summary.valueAtRiskBandABAUD)}.`,
  );
  console.log(`High-confidence share: ${formatPercent(summary.highConfidenceShare)}.`);
  if (model.warnings.length > 0) {
    console.log('');
    for (const warning of model.warnings) console.log(`Warning: ${warning}`);
  }
}

function printRanked(model: SiteModel, top: number): void {
  console.log(`${pad('#', 4)}${pad('Score', 7)}${pad('Band', 6)}${pad('Asset', 38)}${pad('Year', 7)}Cost`);
  for (const row of model.ranked.slice(0, top)) {
    const year = row.exposure.alreadyExposed
      ? 'now'
      : row.exposure.exposureDateBest === null
        ? '100+'
        : String(row.exposure.exposureDateBest);
    console.log(
      `${pad(row.rank, 4)}${pad(row.score, 7)}${pad(row.exposure.band, 6)}${pad(row.asset.name.slice(0, 36), 38)}${pad(year, 7)}${formatAUD(row.asset.replacementCostAUD)}`,
    );
  }
}

function printInterventions(model: SiteModel): void {
  model.interventions.forEach((item, index) => {
    const primary = item.options[0];
    console.log(
      `${index + 1}. ${item.asset.name} (${formatClass(item.asset.class)}, band ${item.exposure.band}, score ${item.score})`,
    );
    if (primary) {
      console.log(
        `   ${primary.title}: ${formatAUD(primary.costLowAUD)} to ${formatAUD(primary.costHighAUD)}, lead ${formatNumber(primary.leadTimeYears, 1)} yrs`,
      );
    }
  });
}

function siteFrom(args: ParsedArgs): SiteInput {
  return loadSite(need(args, 'site')).site;
}

function warnIssues(warnings: ValidationIssue[]): void {
  if (warnings.length === 0) return;
  console.log(formatIssues(warnings));
}

function run(argv: string[]): number {
  const args = parseArgs(argv);
  const command = args.command;

  if (command === '' || command === 'help' || args.flags.has('help')) {
    console.log(`shorerisk - coastal asset risk register

  shorerisk validate --site FILE
  shorerisk model    --site FILE [--baseline YEAR] [--horizon YEARS] [--json]
  shorerisk rank     --site FILE [--top N] [--json]
  shorerisk brief    --site FILE --out FILE
  shorerisk plan     --site FILE --out FILE
  shorerisk export   --site FILE --out FILE
  shorerisk build    --site FILE --out-dir DIR
  shorerisk import   --rates FILE [--seaward-bearing DEG] [--transect-length M] [--prefix P] --out FILE
  shorerisk import-osm --assets FILE --out FILE
  shorerisk combine  --transects FILE --assets FILE --id ID --name NAME [--council NAME] [--state NAME] [--baseline YEAR] --out FILE
  shorerisk demo     [--json]

Exit codes: 0 ok, 1 runtime error, 2 usage, 3 data.`);
    return 0;
  }

  if (command === 'validate') {
    const result = loadSite(need(args, 'site'));
    console.log(
      `OK ${result.site.id}: ${result.site.transects.length} transects, ${result.site.assets.length} assets.`,
    );
    warnIssues(result.warnings);
    return 0;
  }

  if (command === 'model') {
    const site = siteFrom(args);
    const model = buildModel(site, {
      baselineYear: optionalNumber(args, 'baseline'),
      horizonYears: optionalNumber(args, 'horizon'),
    });
    if (args.flags.has('json')) {
      console.log(JSON.stringify(model, null, 2));
    } else {
      printModel(model);
    }
    return 0;
  }

  if (command === 'rank') {
    const site = siteFrom(args);
    const model = buildModel(site, {
      baselineYear: optionalNumber(args, 'baseline'),
      horizonYears: optionalNumber(args, 'horizon'),
    });
    const top = optionalNumber(args, 'top') ?? 10;
    if (args.flags.has('json')) {
      console.log(JSON.stringify(model.ranked.slice(0, top), null, 2));
    } else {
      printRanked(model, top);
    }
    return 0;
  }

  if (command === 'brief') {
    const site = siteFrom(args);
    const model = buildModel(site);
    const out = need(args, 'out');
    writeOut(out, renderBrief(model));
    console.log(`Wrote ${out}`);
    return 0;
  }

  if (command === 'plan') {
    const site = siteFrom(args);
    const model = buildModel(site);
    const out = need(args, 'out');
    writeOut(out, renderPlan(site, model));
    console.log(`Wrote ${out}`);
    return 0;
  }

  if (command === 'export') {
    const site = siteFrom(args);
    const model = buildModel(site);
    const out = need(args, 'out');
    writeOut(out, `${JSON.stringify(toGeoJson(site, model), null, 2)}\n`);
    console.log(`Wrote ${out} (${model.summary.assessedCount} assessed features)`);
    return 0;
  }

  if (command === 'build') {
    const site = siteFrom(args);
    const model = buildModel(site);
    const outDir = args.values.get('out-dir') ?? 'web';
    writeOut(join(outDir, 'model.json'), `${JSON.stringify(model, null, 2)}\n`);
    writeOut(join(outDir, 'brief.html'), renderBrief(model));
    writeOut(join(outDir, 'plan.svg'), renderPlan(site, model));
    writeOut(join(outDir, 'risk.geojson'), `${JSON.stringify(toGeoJson(site, model), null, 2)}\n`);
    console.log(`Wrote model.json, brief.html, plan.svg and risk.geojson to ${outDir}`);
    printModel(model);
    return 0;
  }

  if (command === 'import') {
    const ratesFile = need(args, 'rates');
    const text = readFileSync(ratesFile, 'utf8');
    const extension = extname(ratesFile).toLowerCase();
    const points: RatePoint[] =
      extension === '.csv' ? parseDeaCsv(text) : parseDeaGeoJson(text);
    const result = buildTransects(points, {
      seawardBearingDeg: optionalNumber(args, 'seaward-bearing'),
      transectLengthM: optionalNumber(args, 'transect-length'),
      idPrefix: args.values.get('prefix'),
    });
    const out = need(args, 'out');
    writeOut(out, `${JSON.stringify({ transects: result.transects }, null, 2)}\n`);
    console.log(`Wrote ${out} with ${result.transects.length} transects.`);
    for (const note of result.notes) console.log(`Note: ${note}`);
    return 0;
  }

  if (command === 'import-osm') {
    const text = readFileSync(need(args, 'assets'), 'utf8');
    const result = parseOverpass(text);
    const out = need(args, 'out');
    writeOut(out, `${JSON.stringify({ assets: result.assets }, null, 2)}\n`);
    console.log(`Wrote ${out} with ${result.assets.length} assets.`);
    for (const note of result.notes) console.log(`Note: ${note}`);
    return 0;
  }

  if (command === 'combine') {
    const transectsRaw = JSON.parse(readFileSync(need(args, 'transects'), 'utf8')) as {
      transects?: unknown;
    };
    const assetsRaw = JSON.parse(readFileSync(need(args, 'assets'), 'utf8')) as {
      assets?: unknown;
    };
    const draft = {
      id: need(args, 'id'),
      name: need(args, 'name'),
      council: args.values.get('council'),
      state: args.values.get('state'),
      baselineYear: optionalNumber(args, 'baseline') ?? new Date().getUTCFullYear(),
      provenance: {
        source: 'DEA Coastlines rates of change and OpenStreetMap',
        dataset: 'Local import',
        retrieved: new Date().toISOString().slice(0, 10),
        licence: 'DEA: CC BY 4.0. OpenStreetMap: ODbL.',
        note: 'Costs and user counts need council review.',
      },
      transects: transectsRaw.transects,
      assets: assetsRaw.assets,
    };
    const result = validateSite(draft);
    const out = need(args, 'out');
    writeOut(out, `${JSON.stringify(result.site, null, 2)}\n`);
    console.log(`Wrote ${out}.`);
    warnIssues(result.warnings);
    return 0;
  }

  if (command === 'demo') {
    const here = dirname(fileURLToPath(import.meta.url));
    const sitePath = resolve(here, '..', 'data', 'site-narrabeen.json');
    const site = loadSite(sitePath).site;
    const model = buildModel(site);
    if (args.flags.has('json')) {
      console.log(JSON.stringify(model, null, 2));
    } else {
      printModel(model);
      console.log('');
      printRanked(model, 5);
      console.log('');
      printInterventions(model);
    }
    return 0;
  }

  throw new UsageError(`Unknown command: ${command}. Run shorerisk --help.`);
}

try {
  const code = run(process.argv.slice(2));
  process.exitCode = code;
} catch (error) {
  const code =
    error instanceof DataError || error instanceof UsageError
      ? error.exitCode
      : 1;
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = code;
}