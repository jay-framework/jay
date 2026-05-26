import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        ssr: true,
        lib: {
            entry: {
                index: resolve(__dirname, 'lib/index.ts'),
                'serve-index': resolve(__dirname, 'lib/serve-index.ts'),
            },
            name: 'jayProductionServer',
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
                '@jay-framework/vite-plugin',
                '@jay-framework/view-state-merge',
                'vite',
            ],
        },
    },
    test: {
        globals: true,
    },
});
