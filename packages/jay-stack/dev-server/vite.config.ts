import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'node18',
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jayStackRuntime',
            fileName: 'index',
            formats: ['es'],
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
                'rollup-plugin-jay',
                'vite-plugin-jay',
            ],
        },
    },
    test: {
        globals: true,
    },
});
