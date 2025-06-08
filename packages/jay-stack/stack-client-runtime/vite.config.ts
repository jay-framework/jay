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
                if (format === 'es') return 'index.js'
                if (format === 'cjs') return 'index.cjs'
                return `index.${format}.js`
            },
            formats: ['es', 'cjs'],
        },
        commonjsOptions: {
            transformMixedEsModules: true,
        },
        rollupOptions: {
            external: ['jay-component', 'jay-json-patch', 'jay-reactive', 'jay-runtime', 'jay-fullstack-component'],
        },
    },
    test: {
        globals: true,
        setupFiles: 'jay-dev-environment/library-dom/vitest.setup.ts',
        environment: 'jsdom',
    },
});
