import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ isSsrBuild }) => ({
    build: {
        minify: false,
        target: 'es2020',
        ssr: isSsrBuild,
        emptyOutDir: false,
        lib: {
            entry: isSsrBuild
                ? { index: resolve(__dirname, 'lib/index.ts') }
                : { 'index.client': resolve(__dirname, 'lib/index.client.ts') },
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                '@jay-framework/component',
                '@jay-framework/fullstack-component',
                '@jay-framework/stack-client-runtime',
                '@jay-framework/stack-server-runtime',
                '@jay-framework/reactive',
                '@jay-framework/runtime',
                'node:fs',
                'node:fs/promises',
                'node:path',
            ],
        },
    },
    test: {
        globals: true,
    },
}));
