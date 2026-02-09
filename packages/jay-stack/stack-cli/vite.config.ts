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
            name: '@jay-framework/jay-stack-cli',
            fileName: 'index',
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                /^node:/,
                '@jay-framework/component',
                '@jay-framework/json-patch',
                '@jay-framework/logger',
                '@jay-framework/reactive',
                '@jay-framework/runtime',
                '@jay-framework/fullstack-component',
                '@jay-framework/stack-route-scanner',
                '@jay-framework/stack-client-runtime',
                '@jay-framework/stack-server-runtime',
                'vite',
                '@jay-framework/rollup-plugin',
                '@jay-framework/vite-plugin',
                '@jay-framework/dev-server',
                '@jay-framework/editor-server',
                '@jay-framework/compiler-shared',
                '@jay-framework/compiler',
                '@jay-framework/compiler-jay-html',
                '@jay-framework/compiler-analyze-exported-types',
                'express',
                'get-port',
            ],
            output: {
                banner: '#!/usr/bin/env node',
                format: 'es',
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
    },
});
