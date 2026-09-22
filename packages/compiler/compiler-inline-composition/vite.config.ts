import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'node18',
        ssr: resolve(__dirname, 'lib/index.ts'),
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jayInlineComposition',
            fileName: 'index',
            formats: ['es'],
        },
        commonjsOptions: { transformMixedEsModules: true, esmExternals: true },
        rollupOptions: {
            external: ['node-html-parser', 'postcss', 'module', 'fs', 'path'],
        },
    },
    test: {
        globals: true,
        setupFiles: '@jay-framework/dev-environment/library-dom/vitest.setup.ts',
        environment: 'jsdom',
    },
});
