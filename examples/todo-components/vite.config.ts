import { resolve } from 'path';
import Inspect from 'vite-plugin-inspect';
import ViteRestart from 'vite-plugin-restart';
import { defineConfig } from 'vitest/config';
import { jayRuntime } from 'rollup-plugin-jay';

const root = resolve(__dirname);

export default defineConfig(({ mode }) => {
    const external =
        mode === 'production' ? [] : ['jay-component', 'jay-reactive', 'jay-runtime', 'jay-secure'];

    return {
        plugins: [
            ViteRestart({
                restart: ['../../packages/rollup-plugin/dist/index.js'],
            }),
            Inspect(),
            jayRuntime(),
        ],
        worker: { rollupOptions: { external } },
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
