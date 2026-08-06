import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';
import pkg from '../package.json' with { type: 'json' };

export default defineConfig({
  define: {
    __SUPDESK_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: '2025-01-01',
        // `nodejs_compat` is deliberately absent. If the library ever reaches
        // for a node: module or a Node global, this suite must fail rather
        // than be quietly rescued by a compatibility shim.
        compatibilityFlags: [],
      },
    }),
  ],
  test: {
    include: ['test-edge/**/*.test.ts'],
  },
});
