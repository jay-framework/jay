import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jaySecure',
            fileName: 'index',
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                '@jay-framework/component',
                '@jay-framework/json-patch',
                '@jay-framework/reactive',
                '@jay-framework/runtime',
                '@jay-framework/serialization',
            ],
        },
    },
    test: {
        globals: true,
        setupFiles: '@jay-framework/dev-environment/library-dom/vitest.setup.ts',
        environment: 'jsdom',
    },
});
