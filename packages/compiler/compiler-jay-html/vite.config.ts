import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'node18',
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jayCompiler',
            fileName: 'index',
            formats: ['es'],
        },
        commonjsOptions: {
            transformMixedEsModules: true,
        },
        rollupOptions: {
            external: [
                '@jay-framework/component',
                '@jay-framework/runtime',
                '@jay-framework/secure',
                '@jay-framework/compiler-shared',
                '@jay-framework/compiler-analyze-exported-types',
                'fs',
                'fs/promises',
                'path',
                'module',
            ],
        },
    },
    test: {
        globals: true,
        setupFiles: '@jay-framework/dev-environment/library-dom/vitest.setup.ts',
        environment: 'jsdom',
        testTimeout: 10000,
    },
});
