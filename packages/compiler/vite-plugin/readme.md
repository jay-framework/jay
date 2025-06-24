# Jay Vite Plugin

The plugin transform `.jay-html` files and jay component files as part of a vite build.

The plugin is a regular vite plugin setup in the `vite.config.ts` file.

An example config

```typescript
import { resolve } from 'path';
import Inspect from 'vite-plugin-inspect';
import { defineConfig } from 'vitest/config';
import { JayRollupConfig, jayRuntime } from 'jay-vite-plugin';
import { rimrafSync } from 'rimraf';

const root = resolve(__dirname);
const jayOptions: JayRollupConfig = {
  tsConfigFilePath: resolve(root, 'tsconfig.json'),
  outputDir: 'build/jay-runtime',
};

export default defineConfig(({ mode }) => {
  const external =
    mode === 'production' ? [] : ['jay-component', 'jay-reactive', 'jay-runtime', 'jay-secure'];
  rimrafSync(resolve(root, 'build'));

  return {
    plugins: [Inspect(), jayRuntime(jayOptions)],
    worker: {
      plugins: () => [jayRuntime(jayOptions)],
    },
    root,
    optimizeDeps: { entries: [] },
    build: {
      emptyOutDir: true,
      minify: false,
      target: 'es2020',
      rollupOptions: { external },
    },
  };
});
```

See full example at [counter](../../../examples/jay/counter)

## configuration:

The plugin configuration `JayRollupConfig` includes

- `tsConfigFilePath?: string` - optional - path for the tsconfig file to use for building jay files.
- `tsCompilerOptionsOverrides?: CompilerOptions` - optional - path for compiler options used for building jay files
- `outputDir?: string` - optional - output dir to write individual transformed / generated files into.
- `isWorker?: boolean` - not need for vite (required when using rollup directly without vite)
- `compilerPatternFiles?: string[]` - compiler pattern files used for secure file splitting.
  See more info at [secure](..%2F..%2Fruntime%2Fsecure)
