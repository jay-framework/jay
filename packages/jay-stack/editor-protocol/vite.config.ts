import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jayEditorProtocol',
            fileName: (format) => {
                if (format === 'es') return 'index.js';
                if (format === 'cjs') return 'index.cjs';
                return `index.${format}.js`;
            },
            formats: ['es', 'cjs'],
        },
        commonjsOptions: {
            transformMixedEsModules: true,
        },
        rollupOptions: {
            external: [],
        },
    },
    test: {
        globals: true,
    },
}); 