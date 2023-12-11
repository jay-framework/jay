import { resolve } from 'path';
import Inspect from 'vite-plugin-inspect';
import ViteRestart from 'vite-plugin-restart';
import { defineConfig } from 'vitest/config';
import { JayRollupConfig, jayRuntime } from 'rollup-plugin-jay';

const root = resolve(__dirname);
const jayOptions: JayRollupConfig = {
    tsConfigFilePath: resolve(root, 'tsconfig.json'),
    outputDir: 'dist/jay-runtime',
};

export default defineConfig(({ mode }) => {
    const external =
        mode === 'production' ? [] : ['jay-component', 'jay-reactive', 'jay-runtime', 'jay-secure'];

    return {
        plugins: [
            ViteRestart({
                restart: ['../../../../../dist/index.js'],
            }),
            Inspect(),
            jayRuntime({
                tsConfigFilePath: resolve(root, 'tsconfig.json'),
            }),
        ],
        worker: {
            rollupOptions: {
                external,
            },
        },
        root,
        optimizeDeps: {
            entries: [],
        },
        build: {
            emptyOutDir: true,
            minify: false,
            target: 'es2020',
            rollupOptions: {
                external,
                input: {
                    main: resolve(root, 'index.html'),
                },
            },
        },
    };
});
