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
            name: 'jay-stack-cli',
            fileName: 'index',
            formats: ['cjs'],
        },
        rollupOptions: {
            external: [
                /^node:/,
                'jay-component',
                'jay-json-patch',
                'jay-reactive',
                'jay-runtime',
                'jay-fullstack-component',
                'jay-stack-route-scanner',
                'jay-stack-client-runtime',
                'jay-stack-server-runtime',
                'vite',
                'jay-rollup-plugin',
                'jay-vite-plugin',
                'jay-dev-server',
                'express',
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
    },
});
