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
                // Tools entry (DL#179): git, setup and validators — toolchain-only, never served.
                tools: resolve(__dirname, 'lib/tools.ts'),
            },
            formats: ['es'],
        },
        rollupOptions: {
            external: [/^@jay-framework\//, 'yaml', /^node:/],
        },
    },
    test: {
        globals: true,
        testTimeout: 30000,
    },
});
