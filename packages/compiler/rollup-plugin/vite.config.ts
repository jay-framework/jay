import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        ssr: resolve(__dirname, 'lib/index.ts'),
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'rollupPluginJay',
            fileName: 'index',
            formats: ['cjs'],
        },
        rollupOptions: {
            external: ['jay-compiler', 'jay-compiler-shared', 'jay-compiler-jay-html'],
        },
    },
    test: {
        globals: true,
        setupFiles: 'jay-dev-environment/library-dom/vitest.setup.ts',
    },
});
