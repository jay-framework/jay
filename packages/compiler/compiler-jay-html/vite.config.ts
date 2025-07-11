import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        ssr: resolve(__dirname, 'lib/index.ts'),
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jayCompiler',
            fileName: 'index',
            formats: ['cjs'],
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
            ],
        },
    },
    test: {
        globals: true,
        setupFiles: '@jay-framework/dev-environment/library-dom/vitest.setup.ts',
        environment: 'jsdom',
    },
});
