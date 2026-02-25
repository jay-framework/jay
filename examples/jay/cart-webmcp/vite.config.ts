import { resolve } from 'path';
import { defineConfig } from 'vite';
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
                  '@jay-framework/runtime',
                  '@jay-framework/runtime-automation',
              ];

    return {
        plugins: [jayRuntime(jayOptions)],
        root,
        optimizeDeps: { entries: [] },
        build: {
            emptyOutDir: true,
            minify: false,
            target: 'es2020',
            rollupOptions: {
                external,
                input: {
                    main: resolve(root, 'index.html'),
                },
            },
        },
    };
});
