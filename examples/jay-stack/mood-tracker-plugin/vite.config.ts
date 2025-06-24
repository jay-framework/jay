import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import { JayRollupConfig, jayRuntime } from 'jay-vite-plugin';

const root = resolve(__dirname);
const jayOptions: JayRollupConfig = {
    tsConfigFilePath: resolve(root, 'tsconfig.json'),
    outputDir: 'build/jay-runtime',
};

export default defineConfig({
    plugins: [jayRuntime(jayOptions)],
    build: {
        minify: false,
        target: 'es2020',
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'jayComponent',
            fileName: 'index',
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                'jay-component',
                'jay-fullstack-component',
                'jay-reactive',
                'jay-runtime',
                'jay-secure',
            ],
        },
    },
    test: {
        globals: true,
        setupFiles: 'jay-dev-environment/library-dom/vitest.setup.ts',
        environment: 'jsdom',
    },
});
