import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        ssr: resolve(__dirname, 'lib/index.ts'),
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jayProductionServer',
            fileName: 'index',
            formats: ['es'],
        },
        commonjsOptions: {
            transformMixedEsModules: true,
        },
        rollupOptions: {
            external: [
                /^node:/,
                '@jay-framework/compiler-jay-html',
                '@jay-framework/compiler-jay-stack',
                '@jay-framework/compiler-shared',
                '@jay-framework/fullstack-component',
                '@jay-framework/logger',
                '@jay-framework/ssr-runtime',
                '@jay-framework/stack-route-scanner',
                '@jay-framework/stack-server-runtime',
                '@jay-framework/view-state-merge',
                'esbuild',
                'vite',
            ],
        },
    },
    test: {
        globals: true,
    },
});
