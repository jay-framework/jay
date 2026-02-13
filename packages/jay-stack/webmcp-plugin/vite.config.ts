import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import { JayRollupConfig, jayStackCompiler } from '@jay-framework/compiler-jay-stack';

const root = resolve(__dirname);
const jayOptions: JayRollupConfig = {
    tsConfigFilePath: resolve(root, 'tsconfig.json'),
    outputDir: 'build/jay-runtime',
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
                : { 'index.client': resolve(__dirname, 'lib/index.ts') },
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                '@jay-framework/fullstack-component',
                '@jay-framework/runtime-automation',
            ],
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: '@jay-framework/dev-environment/library/vitest.setup.ts',
    },
}));
