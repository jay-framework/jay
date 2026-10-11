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
                // Tools entry (DL#179): compiler-allowed, toolchain-only.
                tools: resolve(__dirname, 'lib/tools.ts'),
            },
            formats: ['es'],
        },
        rollupOptions: {
            // Externalize the compiler so any leak into the serve entry (`.`) surfaces as a
            // literal import string in dist/index.js (DL#179 leak scan).
            external: [/^@jay-framework\/compiler-/],
        },
    },
    test: {
        globals: true,
    },
});
