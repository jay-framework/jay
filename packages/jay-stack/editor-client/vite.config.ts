import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jayEditorClient',
            fileName: 'index',
            formats: ['es'],
        },
        commonjsOptions: {
            transformMixedEsModules: true,
        },
        rollupOptions: {
            external: ['@jay-framework/editor-protocol', '@jay-framework/logger', 'socket.io-client', 'get-port', 'uuid'],
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
    },
});
