import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jayWebMCP',
            fileName: 'index',
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                '@jay-framework/fullstack-component',
                '@jay-framework/runtime-automation',
            ],
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: '@jay-framework/dev-environment/library/vitest.setup.ts',
    },
});
