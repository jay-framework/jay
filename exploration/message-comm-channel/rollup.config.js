// rollup.config.js
import { defineConfig } from 'rollup';
import typescript from 'rollup-plugin-typescript2';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const rollupConfig = defineConfig(
    {
        input: './lib/index.ts',
        output: {
            file: 'dist/index.js',
            format: 'es',
            sourcemap: true,
        },
        plugins: [typescript(), nodeResolve()],
    },
    {
        input: './lib/worker.ts',
        output: {
            file: 'dist/worker.js',
            format: 'es',
            sourcemap: true,
        },
        plugins: [typescript(), nodeResolve()],
    },
);

export default rollupConfig;
