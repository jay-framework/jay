import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        ssr: resolve(__dirname, 'lib/index.ts'),
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'cli',
            fileName: 'index',
            formats: ['cjs'],
        },
        rollupOptions: {
            external: ['jay-compiler'],
            output: {
                banner: '#!/usr/bin/env node',
            },
        },
    },
    test: {
        globals: true,
        setupFiles: 'jay-dev-environment/library/vitest.setup.ts',
    },
});
