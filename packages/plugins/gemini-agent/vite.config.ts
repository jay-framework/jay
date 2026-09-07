import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import { JayRollupConfig, jayStackCompiler } from '@jay-framework/compiler-jay-stack';

const root = resolve(__dirname);
const jayOptions: JayRollupConfig = {
    tsConfigFilePath: resolve(root, 'tsconfig.json'),
    outputDir: 'build',
};

export default defineConfig(({ isSsrBuild }) => ({
    plugins: [...jayStackCompiler(jayOptions)],
    build: {
        minify: false,
        target: 'es2020',
        ssr: isSsrBuild,
        emptyOutDir: false,
        lib: {
            entry: isSsrBuild
                ? {
                      index: resolve(__dirname, 'lib/index.ts'),
                      // Tools entry (DL#179): setup handler, compiler-allowed, toolchain-only.
                      tools: resolve(__dirname, 'lib/tools.ts'),
                  }
                : { 'index.client': resolve(__dirname, 'lib/index.client.ts') },
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                '@jay-framework/fullstack-component',
                '@jay-framework/runtime',
                '@jay-framework/runtime-automation',
                '@jay-framework/stack-client-runtime',
                '@jay-framework/stack-server-runtime',
                '@jay-framework/component',
                '@google/genai',
                // Externalize the compiler so any leak into `.` surfaces in dist/index.js (DL#179).
                /^@jay-framework\/compiler-/,
            ],
        },
    },
    test: {
        globals: true,
        environment: 'node',
    },
}));
