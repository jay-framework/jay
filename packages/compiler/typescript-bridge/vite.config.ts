import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        lib: {
            entry: 'lib/index.ts',
            name: 'JayTypeScriptBridge',
            fileName: 'index',
            formats: ['es'],
        },
        rollupOptions: {
            external: ['typescript', 'module'],
        },
    },
    define: {
        global: 'globalThis',
    },
});
