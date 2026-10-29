import { offsetPoint } from '../src/geo.js';
import type { AssetInput, SiteInput, TransectInput } from '../src/types.js';

export const START: readonly [number, number] = [151.3, -33.7];

export function placeNorth(metres: number): readonly [number, number] {
  return offsetPoint(START, 0, metres);
}

export function makeTransect(overrides: Partial<TransectInput> = {}): TransectInput {
  return {
    id: 'T1',
    label: 'T1',
    offshore: START,
    onshore: placeNorth(200),
    rateMPerYear: -0.5,
    seMPerYear: 0.1,
    sigPValue: 0.001,
    validObs: 30,
    validSpan: 30,
    certainty: 'good',
    ...overrides,
  };
}

export function makeAsset(overrides: Partial<AssetInput> = {}): AssetInput {
  return {
    id: 'a1',
    name: 'Asset one',
    class: 'path',
    position: placeNorth(10),
    replacementCostAUD: 100_000,
    usersPerDay: 100,
    ...overrides,
  };
}

export function makeSite(
  options: {
    transects?: TransectInput[];
    assets?: AssetInput[];
    baselineYear?: number;
  } = {},
): SiteInput {
  return {
    id: 'test',
    name: 'Test Beach',
    council: 'Test Council',
    state: 'NSW',
    baselineYear: options.baselineYear ?? 2026,
    provenance: {
      source: 'Test fixture',
      dataset: 'Synthetic',
      retrieved: '2026-10-30',
      licence: 'MIT',
      note: 'Test only.',
    },
    transects: options.transects ?? [makeTransect()],
    assets: options.assets ?? [makeAsset()],
  };
}