import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: './src/index.ts',
    actions: './src/actions.ts',
    cli: './src/cli/index.ts',
    'cli/config': './src/cli/config.ts',
    'allow/index': './src/allow/index.ts',
  },
  format: 'esm',
  target: 'es2024',
  dts: true,
  sourcemap: true,
  clean: true,
})
