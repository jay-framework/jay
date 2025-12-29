import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        ssr: true, // Build for Node.js environment
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jayStackCompiler',
            fileName: 'index',
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                '@jay-framework/compiler',
                '@jay-framework/compiler-shared',
                '@jay-framework/typescript-bridge',
                '@jay-framework/vite-plugin',
                'vite',
                'typescript', // Required for action import transform
            ],
        },
    },
    test: {
        globals: true,
    },
});
