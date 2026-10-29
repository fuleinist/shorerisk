import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sitePath = join(root, 'data', 'site-narrabeen.json');

function cli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('validate accepts the sample site', () => {
  const result = cli(['validate', '--site', sitePath]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OK narrabeen: 12 transects, 16 assets/);
});

test('rank prints the requested number of rows', () => {
  const result = cli(['rank', '--site', sitePath, '--top', '3']);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 4);
  assert.match(lines[0] ?? '', /^#/);
});

test('build writes all four outputs', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'shorerisk-build-'));
  const result = cli(['build', '--site', sitePath, '--out-dir', outDir]);
  assert.equal(result.status, 0, result.stderr);
  for (const name of ['model.json', 'brief.html', 'plan.svg', 'risk.geojson']) {
    assert.ok(existsSync(join(outDir, name)), `${name} is missing`);
  }
  const model = JSON.parse(readFileSync(join(outDir, 'model.json'), 'utf8')) as {
    siteId: string;
    ranked: { score: number }[];
  };
  assert.equal(model.siteId, 'narrabeen');
  assert.ok(model.ranked.length > 0);
  const svg = readFileSync(join(outDir, 'plan.svg'), 'utf8');
  assert.match(svg, /^<svg/);
});

test('a bad site exits with code 3', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shorerisk-bad-'));
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{"id":"x"}', 'utf8');
  const result = cli(['validate', '--site', bad]);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /not valid/);
});

test('a missing option exits with code 2', () => {
  const result = cli(['rank']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Missing required option --site/);
});

test('an unknown command exits with code 2', () => {
  const result = cli(['frobnicate']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown command/);
});

test('import writes transects from a DEA style CSV', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shorerisk-import-'));
  const csv = join(dir, 'rates.csv');
  writeFileSync(
    csv,
    [
      'uid,lon,lat,rate_time,se_time,sig_time,valid_obs,valid_span',
      'a,151.30,-33.700,-0.4,0.1,0.002,30,32',
      'b,151.30,-33.701,-0.5,0.1,0.002,30,32',
    ].join('\n'),
    'utf8',
  );
  const out = join(dir, 'rates.json');
  const result = cli(['import', '--rates', csv, '--out', out]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(readFileSync(out, 'utf8')) as { transects: unknown[] };
  assert.equal(parsed.transects.length, 2);
});

test('demo prints the sample site summary', () => {
  const result = cli(['demo']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Narrabeen Beach/);
  assert.match(result.stdout, /Bands: A/);
});