import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        minify: false,
        target: 'node20',
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            formats: ['es'],
            fileName: () => 'index.js',
        },
        rollupOptions: {
            external: [
                '@jay-framework/compiler-jay-html',
                '@jay-framework/compiler-shared',
                '@jay-framework/editor-protocol',
                'chalk',
                'yaml',
                'fs',
                'path',
            ],
        },
    },
});

