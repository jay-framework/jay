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
            // Same entry point - environment is detected from build.ssr / options.ssr
            entry: isSsrBuild
                ? { index: resolve(__dirname, 'lib/index.ts') }
                : { 'index.client': resolve(__dirname, 'lib/index.ts') },
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                '@jay-framework/component',
                '@jay-framework/fullstack-component',
                '@jay-framework/reactive',
                '@jay-framework/runtime',
                '@jay-framework/secure',
                '@jay-framework/stack-client-runtime', // Required for action callers in client build
            ],
        },
    },
    test: {
        globals: true,
        setupFiles: '@jay-framework/dev-environment/library-dom/vitest.setup.ts',
        environment: 'jsdom',
    },
}));
