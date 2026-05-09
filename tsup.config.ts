import { chmodSync } from 'node:fs';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node24',
  outDir: 'dist',
  clean: true,
  shims: false,
  splitting: false,
  sourcemap: true,
  banner: { js: '#!/usr/bin/env node' },
  onSuccess: async () => {
    chmodSync('dist/server.js', 0o755);
  },
});
