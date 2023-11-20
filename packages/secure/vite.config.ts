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
                'jay-component',
                'jay-json-patch',
                'jay-reactive',
                'jay-runtime',
                'jay-serialization',
            ],
        },
    },
    test: {
        globals: true,
        setupFiles: 'jay-dev-environment/library-dom/vitest.setup.ts',
        environment: 'jsdom',
    },
});
