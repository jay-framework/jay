import { resolve } from 'path';
import Inspect from 'vite-plugin-inspect';
import { defineConfig } from 'vitest/config';
import { JayRollupConfig, jayRuntime } from 'vite-plugin-jay';

const root = resolve(__dirname);
const jayOptions: JayRollupConfig = {
    tsConfigFilePath: resolve(root, 'tsconfig.json'),
    outputDir: 'build/jay-runtime',
};

export default defineConfig(({ mode }) => {
    const external =
        mode === 'production' ? [] : ['jay-component', 'jay-reactive', 'jay-runtime', 'jay-secure'];

    return {
        plugins: [Inspect(), jayRuntime(jayOptions)],
        worker: {
            plugins: () => [jayRuntime(jayOptions)],
        },
        root,
        optimizeDeps: { entries: [] },
        build: {
            minify: false,
            target: 'es2020',
            rollupOptions: {
                external,
                input: {
                    trusted: resolve(root, 'index.html'),
                    secure: resolve(root, 'secure.html'),
                },
            },
        },
    };
});
