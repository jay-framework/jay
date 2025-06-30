import { resolve } from 'path';
import Inspect from 'vite-plugin-inspect';
import { defineConfig } from 'vitest/config';
import { JayRollupConfig, jayRuntime } from '@jay-framework/vite-plugin';
import { rimrafSync } from 'rimraf';
import react from '@vitejs/plugin-react';
import { GenerateTarget } from '@jay-framework/compiler-shared';

const root = resolve(__dirname);
const jayOptions: JayRollupConfig = {
    tsConfigFilePath: resolve(root, 'tsconfig.json'),
    outputDir: 'build/jay-runtime',
    generationTarget: GenerateTarget.react,
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
    rimrafSync(resolve(root, 'build'));

    return {
        plugins: [Inspect(), jayRuntime(jayOptions), react()],
        root,
        optimizeDeps: { entries: [] },
        build: {
            emptyOutDir: true,
            minify: false,
            target: 'es2020',
            rollupOptions: {
                external,
                input: {
                    index: resolve(root, 'index.html'),
                },
            },
        },
    };
});
