// Fails the build if anything Node-only leaked into the published bundle.
// This is a cheap backstop; the workerd and Deno jobs are the real proof.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;

const FORBIDDEN = [
  { pattern: /require\(\s*['"]node:/, label: "require('node:…')" },
  { pattern: /from\s*['"]node:/, label: "import from 'node:…'" },
  { pattern: /\bBuffer\s*\./, label: 'Buffer' },
  { pattern: /\bprocess\s*\.\s*(env|version|platform|cwd)/, label: 'process.*' },
  { pattern: /\b__dirname\b/, label: '__dirname' },
  { pattern: /\b__filename\b/, label: '__filename' },
];

let failed = false;

for (const file of readdirSync(DIST)) {
  if (!/\.(js|cjs|mjs)$/.test(file)) continue;
  const source = readFileSync(join(DIST, file), 'utf8');
  for (const { pattern, label } of FORBIDDEN) {
    if (pattern.test(source)) {
      console.error(`✗ dist/${file} references ${label} — not edge-safe`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('✓ dist is free of Node-only globals and specifiers');
