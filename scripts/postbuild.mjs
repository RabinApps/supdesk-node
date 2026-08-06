// Build-time only — never shipped, so Node APIs are fine here.
//
// vite-plugin-dts emits a single dist/index.d.ts. Serving that same file to the
// `require` condition is what @arethetypeswrong/cli flags as "masquerading as
// ESM", so the CJS branch gets its own .d.cts copy.
import { copyFileSync, existsSync } from 'node:fs';

const src = new URL('../dist/index.d.ts', import.meta.url);
const dest = new URL('../dist/index.d.cts', import.meta.url);

if (!existsSync(src)) {
  console.error('postbuild: dist/index.d.ts not found — did `vite build` run?');
  process.exit(1);
}

copyFileSync(src, dest);
console.log('postbuild: wrote dist/index.d.cts');
