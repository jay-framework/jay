import { resolve } from 'path';
import { defineConfig } from 'vitest/config';


export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        emptyOutDir: false,
        lib: {
            entry: resolve(__dirname, 'lib/test-utils.ts'),
            name: 'jaySecureTestUtils',
            fileName: 'test-utils/index',
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                'jay-component',
                'jay-json-patch',
                'jay-reactive',
                'jay-runtime',
                'jay-serialization',
                '../'
            ],
            output: {
                entryFileNames: 'test-utils.js'
            },
        },
    },
    test: {
        globals: true,
        setupFiles: 'jay-dev-environment/library-dom/vitest.setup.ts',
        environment: 'jsdom',
    },
});
