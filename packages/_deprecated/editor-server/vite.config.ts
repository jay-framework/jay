import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        ssr: resolve(__dirname, 'lib/index.ts'),
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jayEditorServer',
            fileName: 'index',
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                /^node:/,
                '@jay-framework/editor-protocol',
                '@jay-framework/logger',
                'socket.io',
                'get-port',
                'yaml',
                'uuid',
                'express',
                'fs',
                'path',
                'http',
                'https',
            ],
        },
    },
    test: {
        globals: true,
    },
});
