import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jayRuntimeAI',
            fileName: 'index',
            formats: ['es'],
        },
        rollupOptions: {
            external: ['@jay-framework/runtime'],
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: '@jay-framework/dev-environment/library/vitest.setup.ts',
    },
});
