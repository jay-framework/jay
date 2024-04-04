import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react'


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
                'jay-component',
                'jay-json-patch',
                'jay-reactive',
                'jay-runtime',
                'jay-serialization',
                'jay-secure',
            ],
        },
    },
    test: {
        globals: true,
        setupFiles: ['jay-dev-environment/library-dom/vitest.setup.ts', './test/setup.ts'],
        environment: 'jsdom',
    },
});
