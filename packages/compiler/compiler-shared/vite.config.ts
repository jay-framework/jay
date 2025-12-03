import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        ssr: resolve(__dirname, 'lib/index.ts'),
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jayCompiler',
            formats: ['es'],
        },
        commonjsOptions: {
            transformMixedEsModules: true,
            esmExternals: true,
        },
        rollupOptions: {
            external: [
                '@jay-framework/component',
                '@jay-framework/runtime',
                '@jay-framework/secure',
                'module', // Node.js module - createRequire
                'prettier', // Has Node.js dependencies
                'js-beautify', // Has Node.js dependencies
            ],
        },
    },
    test: {
        globals: true,
        setupFiles: '@jay-framework/dev-environment/library-dom/vitest.setup.ts',
        environment: 'jsdom',
    },
});
