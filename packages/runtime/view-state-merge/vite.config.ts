import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jayViewStateMerge',
            fileName: 'index',
            formats: ['es'],
        },
    },
    test: {
        globals: true,
        setupFiles: '@jay-framework/dev-environment/library/vitest.setup.ts',
    },
});
