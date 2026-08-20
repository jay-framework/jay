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
                ? { index: resolve(__dirname, 'lib/index.ts') }
                : { 'index.client': resolve(__dirname, 'lib/index.client.ts') },
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                '@jay-framework/compiler-shared',
                '@jay-framework/compiler-jay-html',
                '@jay-framework/component',
                '@jay-framework/fullstack-component',
                '@jay-framework/plugin-validator',
                '@jay-framework/stack-client-runtime',
                '@jay-framework/stack-server-runtime',
                'js-yaml',
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
