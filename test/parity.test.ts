import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModel } from '../src/model.js';
import { loadSite } from '../src/site.js';
import type { SiteModel } from '../src/types.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modelPath = join(root, 'web', 'model.json');

test(
  'the committed web model matches a fresh build',
  { skip: !existsSync(modelPath) ? 'web/model.json is not built yet' : false },
  () => {
    const committed = JSON.parse(readFileSync(modelPath, 'utf8')) as SiteModel;
    const site = loadSite(join(root, 'data', 'site-narrabeen.json')).site;
    const fresh = buildModel(site, { now: new Date(committed.generatedAt) });

    assert.equal(committed.siteId, fresh.siteId);
    assert.equal(committed.ranked.length, fresh.ranked.length);
    committed.ranked.forEach((row, index) => {
      const other = fresh.ranked[index];
      assert.ok(other);
      assert.equal(row.asset.id, other.asset.id);
      assert.equal(row.exposure.band, other.exposure.band);
      assert.equal(row.score, other.score);
      assert.equal(row.exposure.exposureYearBest, other.exposure.exposureYearBest);
    });
    assert.deepEqual(committed.summary, fresh.summary);
  },
);