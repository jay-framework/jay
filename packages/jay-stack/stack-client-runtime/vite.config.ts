import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jayStackRuntime',
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
            external: [
                '@jay-framework/component',
                '@jay-framework/json-patch',
                '@jay-framework/reactive',
                '@jay-framework/runtime',
                '@jay-framework/fullstack-component',
            ],
        },
    },
    test: {
        globals: true,
        setupFiles: '@jay-framework/dev-environment/library-dom/vitest.setup.ts',
        environment: 'jsdom',
    },
});
