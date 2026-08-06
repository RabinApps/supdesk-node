import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  define: {
    __SUPDESK_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
    // Libraries should ship readable code; consumers minify.
    minify: false,
    sourcemap: true,
    lib: {
      entry: 'src/index.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    rollupOptions: {
      // Zero runtime dependencies: nothing may be left external, or the
      // bundle would stop being self-contained for edge runtimes.
      external: [],
    },
  },
  plugins: [
    dts({
      include: ['src'],
      // Flattens every declaration into a single dist/index.d.ts, which is what
      // the `exports` map points at. (Called `rollupTypes` before v5.)
      bundleTypes: true,
      insertTypesEntry: true,
    }),
  ],
});
