import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jayStackCompiler',
            fileName: 'index',
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                '@jay-framework/compiler',
                '@jay-framework/typescript-bridge',
                '@jay-framework/vite-plugin',
                'vite',
            ],
        },
    },
    test: {
        globals: true,
    },
});
