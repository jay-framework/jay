import { resolve } from 'path';
import Inspect from 'vite-plugin-inspect';
import { defineConfig } from 'vitest/config';
import { JayRollupConfig, jayRuntime } from '@jay-framework/vite-plugin';

const root = resolve(__dirname);
const jayOptions: JayRollupConfig = {
    tsConfigFilePath: resolve(root, 'tsconfig.json'),
    outputDir: 'build/jay-runtime',
};

export default defineConfig(({ mode }) => {
    const external =
        mode === 'production'
            ? []
            : [
                  '@jay-framework/component',
                  '@jay-framework/reactive',
                  '@jay-framework/runtime',
                  '@jay-framework/secure',
              ];

    return {
        plugins: [Inspect(), jayRuntime(jayOptions)],
        worker: {
            rollupOptions: { external },
        },
        root,
        optimizeDeps: {
            entries: [],
        },
        build: {
            emptyOutDir: true,
            minify: false,
            target: 'es2020',
            rollupOptions: { external },
        },
    };
});
