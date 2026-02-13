import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  clean: true,
  sourcemap: true,
  dts: true,
  target: false,
});
