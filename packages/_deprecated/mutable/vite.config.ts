import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'mutable',
            fileName: 'index',
            formats: ['es'],
        },
        rollupOptions: {
            external: ['@jay-framework/reactive'],
        },
    },
    test: {
        globals: true,
        setupFiles: '@jay-framework/dev-environment/library/vitest.setup.ts',
    },
});
