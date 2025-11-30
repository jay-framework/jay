import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import { JayRollupConfig, jayStackCompiler } from '@jay-framework/compiler-jay-stack';

const root = resolve(__dirname);
const jayOptions: JayRollupConfig = {
    tsConfigFilePath: resolve(root, 'tsconfig.json'),
    outputDir: 'build/jay-runtime',
};

export default defineConfig({
    plugins: [...jayStackCompiler(jayOptions)],
    build: {
        minify: false,
        target: 'es2020',
        lib: {
            entry: {
                // Server build (client code stripped)
                'index': resolve(__dirname, 'lib/index.ts?jay-server'),
                // Client build (server code stripped)
                'index.client': resolve(__dirname, 'lib/index.ts?jay-client'),
            },
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                '@jay-framework/component',
                '@jay-framework/fullstack-component',
                '@jay-framework/reactive',
                '@jay-framework/runtime',
                '@jay-framework/secure',
            ],
        },
    },
    test: {
        globals: true,
        setupFiles: '@jay-framework/dev-environment/library-dom/vitest.setup.ts',
        environment: 'jsdom',
    },
});
