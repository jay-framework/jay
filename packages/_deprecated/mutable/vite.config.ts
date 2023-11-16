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
            external: ['jay-reactive'],
        },
    },
    test: {
        globals: true,
        setupFiles: 'jay-dev-environment/library/vitest.setup.ts',
    },
});
