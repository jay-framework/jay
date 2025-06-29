import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import { makeCliRunnable } from './scripts/make-cli-runnable';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        ssr: resolve(__dirname, 'lib/index.ts'),
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jayCli',
            fileName: 'index',
            formats: ['cjs'],
        },
        rollupOptions: {
            external: [
                '@jay-framework/compiler',
                '@jay-framework/rollup-plugin',
                '@jay-framework/compiler-shared',
                '@jay-framework/compiler-jay-html',
            ],
            output: {
                banner: '#!/usr/bin/env node',
            },
        },
    },
    plugins: [
        {
            name: 'runnable-cli',
            closeBundle: () => makeCliRunnable(),
        },
    ],
    test: {
        globals: true,
        setupFiles: '@jay-framework/dev-environment/library/vitest.setup.ts',
    },
});
