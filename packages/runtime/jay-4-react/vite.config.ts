import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    build: {
        minify: false,
        target: 'es2020',
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jaySecureReact',
            fileName: 'index',
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                '@jay-framework/component',
                '@jay-framework/json-patch',
                '@jay-framework/reactive',
                '@jay-framework/runtime',
                '@jay-framework/serialization',
                '@jay-framework/secure',
                'react',
                'react-dom',
            ],
        },
    },
    test: {
        globals: true,
        setupFiles: [
            '@jay-framework/dev-environment/library-dom/vitest.setup.ts',
            './test/setup.ts',
        ],
        environment: 'jsdom',
    },
});
