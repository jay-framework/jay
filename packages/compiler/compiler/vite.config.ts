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
            formats: ['es'],
        },
        commonjsOptions: {
            transformMixedEsModules: true,
            esmExternals: true,
        },
        rollupOptions: {
            external: [
                '@jay-framework/component',
                '@jay-framework/runtime',
                '@jay-framework/secure',
                '@jay-framework/compiler-shared',
                '@jay-framework/compiler-analyze-exported-types',
                '@jay-framework/compiler-jay-html',
                'typescript',
            ],
        },
    },
    test: {
        globals: true,
        setupFiles: '@jay-framework/dev-environment/library-dom/vitest.setup.ts',
        environment: 'jsdom',
        // These suites drive the TypeScript compiler (transformComponent, imports file, full-project
        // generation), so individual tests can take ~1-2s cold. Under the concurrent monorepo test
        // run (wsrun runs ~60 package suites at once) CPU contention can push them past Vitest's 5s
        // default — raise the ceiling so this is not flaky.
        testTimeout: 30000,
    },
});
