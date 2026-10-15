import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        ssr: true,
        emptyOutDir: false,
        lib: {
            entry: {
                index: resolve(__dirname, 'lib/index.ts'),
                tools: resolve(__dirname, 'lib/tools.ts'),
            },
            formats: ['es'],
        },
        rollupOptions: {
            external: [/^@jay-framework\//],
        },
    },
    test: {
        globals: true,
    },
});
