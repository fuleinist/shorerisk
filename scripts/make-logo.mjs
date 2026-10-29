#!/usr/bin/env node
/**
 * Render the 8-bit style logo from a character grid. No dependencies.
 *
 * Run: node scripts/make-logo.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PALETTE = {
  n: '#0d2231',
  y: '#f2c14e',
  s: '#1f6f8b',
  f: '#8fd3e8',
  d: '#e9c987',
  r: '#b3261e',
  h: '#f5f2e8',
  g: '#4f8a4f',
};

const GRID = [
  'nnnnnnnnnnnn',
  'nnnnnnnnnnyn',
  'nnnnnnnnnnyy',
  'ssssssssssss',
  'fsssffssssss',
  'ssssssssssss',
  'ssffssssffss',
  'ssssssssssss',
  'dddddddddddd',
  'dddrrrrddddd',
  'ddddhhhddddd',
  'ddgddgddgddd',
];

const SIZE = 12;
const SCALE = 40;
const OFFSET = 16;
const WIDTH = SIZE * SCALE + OFFSET * 2;

let body = '';
GRID.forEach((row, y) => {
  if (row.length !== SIZE) throw new Error(`Row ${y} has ${row.length} cells`);
  row.split('').forEach((cell, x) => {
    const colour = PALETTE[cell];
    if (!colour) return;
    body += `<rect x="${OFFSET + x * SCALE}" y="${OFFSET + y * SCALE}" width="${SCALE}" height="${SCALE}" fill="${colour}"/>`;
  });
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${WIDTH}" width="${WIDTH}" height="${WIDTH}" role="img" aria-label="shorerisk logo: a pixel coastline with sea, sand and a small house">
  <title>shorerisk</title>
  <rect width="${WIDTH}" height="${WIDTH}" rx="18" fill="#0d2231"/>
  <g shape-rendering="crispEdges">${body}</g>
</svg>
`;

const here = dirname(fileURLToPath(import.meta.url));
for (const target of [
  resolve(here, '..', 'docs', 'logo.svg'),
  resolve(here, '..', 'web', 'logo.svg'),
]) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, svg, 'utf8');
  console.log(`Wrote ${target}`);
}