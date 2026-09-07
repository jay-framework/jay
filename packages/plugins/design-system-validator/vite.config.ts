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
                      // Tools entry (DL#179/#180): validators, agent-kit, devOnly settings
                      // actions + page. Compiler-allowed, toolchain/dev-only.
                      tools: resolve(__dirname, 'lib/tools.ts'),
                  }
                : { 'index.client': resolve(__dirname, 'lib/index.client.ts') },
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                // Externalize the whole compiler namespace so any leak into `.` surfaces as a
                // literal import string in dist/index.js (DL#179 leak scan).
                /^@jay-framework\/compiler-/,
                '@jay-framework/component',
                '@jay-framework/fullstack-component',
                '@jay-framework/plugin-validator',
                '@jay-framework/stack-client-runtime',
                '@jay-framework/stack-server-runtime',
                'js-yaml',
                '@capsizecss/core',
                '@capsizecss/metrics',
                /^@capsizecss\/metrics\//,
                '@capsizecss/unpack',
                'postcss',
                'postcss-selector-parser',
                '@csstools/selector-specificity',
            ],
        },
    },
    test: {
        globals: true,
    },
}));
