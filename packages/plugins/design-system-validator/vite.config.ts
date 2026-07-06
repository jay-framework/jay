import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        ssr: true,
        emptyOutDir: false,
        lib: {
            entry: { index: resolve(__dirname, 'lib/index.ts') },
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                '@jay-framework/compiler-shared',
                '@jay-framework/stack-server-runtime',
                'postcss',
                'postcss-selector-parser',
                '@csstools/selector-specificity',
                'js-yaml',
            ],
        },
    },
    test: {
        globals: true,
    },
});
