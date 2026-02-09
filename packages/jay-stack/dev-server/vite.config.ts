import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        ssr: resolve(__dirname, 'lib/index.ts'),
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jayStackRuntime',
            fileName: 'index',
            formats: ['es'],
        },
        commonjsOptions: {
            transformMixedEsModules: true,
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
                '@jay-framework/compiler-shared',
                '@jay-framework/compiler-jay-html',
                'vite',
                '@jay-framework/rollup-plugin',
                '@jay-framework/vite-plugin',
            ],
        },
    },
    test: {
        globals: true,
    },
});
