import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        lib: {
            entry: {
                index: resolve(__dirname, 'lib/index.ts'),
                tracing: resolve(__dirname, 'lib/reactive-with-tracing.ts')
            },
            name: 'jayReactive',
            // fileName: 'index',
            formats: ['es'],
        },
    },
    test: {
        globals: true,
        setupFiles: 'jay-dev-environment/library/vitest.setup.ts',
    },
});
