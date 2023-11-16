import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        ssr: resolve(__dirname, 'lib/index.ts'),
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'component',
            fileName: 'index',
            formats: ['cjs'],
        },
        commonjsOptions: {
            transformMixedEsModules: true,
        },
        rollupOptions: {
            external: ['jay-component', 'jay-runtime', 'jay-secure'],
        },
    },
    test: {
        globals: true,
        setupFiles: 'jay-dev-environment/library-dom/vitest.setup.ts',
        environment: 'jsdom',
    },
});
