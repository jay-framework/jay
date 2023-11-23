// rollup.config.js
import { defineConfig } from 'rollup';
import typescript from 'rollup-plugin-typescript2';
import { terser } from 'rollup-plugin-terser';
import jay from 'rollup-plugin-jay';
import copy from 'rollup-plugin-copy';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const rollupConfig = defineConfig({
    input: './lib/index.ts',
    output: [
        {
            file: './dist/index.js',
            format: 'iife',
            name: 'jay',
            sourcemap: true,
        },
        {
            file: './dist/index.min.js',
            format: 'iife',
            name: 'jay',
            plugins: [terser()],
            sourcemap: true,
        },
    ],
    context: 'window',
    plugins: [
        jay(),
        typescript(),
        nodeResolve(),
        copy({
            targets: [
                { src: './lib/**/*.css', dest: './dist' },
                { src: './lib/index.html', dest: './dist' },
            ],
        }),
    ],
});

export default rollupConfig;
