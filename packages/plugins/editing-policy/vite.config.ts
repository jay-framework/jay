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
                // Tools entry (DL#179): compiler-allowed, toolchain-only (the policy-file validator).
                tools: resolve(__dirname, 'lib/tools.ts'),
                // Library entry: the pure policy engine (parsePolicy / checkPolicy / comparePolicy).
                api: resolve(__dirname, 'lib/api.ts'),
                // Standalone `compare` bin (DL#231 §6.3).
                compare: resolve(__dirname, 'lib/bin/compare.ts'),
            },
            formats: ['es'],
        },
        rollupOptions: {
            // Externalize the compiler so any leak into the serve entry (`.`) surfaces as a
            // literal import string in dist/index.js (DL#179 leak scan).
            external: [
                /^@jay-framework\/compiler-/,
                'minimatch',
                'node-html-parser',
                'yaml',
                'fs',
                'path',
                'crypto',
                'url',
            ],
            output: {
                // Keep the shebang only on the bin chunk.
                banner: (chunk) => (chunk.name === 'compare' ? '#!/usr/bin/env node' : ''),
            },
        },
    },
    test: {
        globals: true,
    },
});
