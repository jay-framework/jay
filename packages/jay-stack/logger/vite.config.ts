import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        ssr: resolve(__dirname, 'lib/index.ts'),
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jayLogger',
            fileName: 'index',
            formats: ['es'],
        },
        rollupOptions: {},
    },
    test: {
        globals: true,
    },
});
