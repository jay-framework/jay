// rollup.config.js
import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';
import jay from 'rollup-plugin-jay';
import copy from 'rollup-plugin-copy';
import { nodeResolve } from '@rollup/plugin-node-resolve';

async function makeRollupConfig() {
    return [
        {
            input: './lib/index.ts',
            output: [
                {
                    file: './dist/index.js',
                    format: 'iife',
                    name: 'jay',
                },
                {
                    file: './dist/index.min.js',
                    format: 'iife',
                    name: 'jay',
                    plugins: [terser()],
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
        },
        {
            input: './lib-secure/main/index.ts',
            output: [
                {
                    file: './dist-secure/index.js',
                    format: 'iife',
                    name: 'jay',
                },
                {
                    file: './dist-secure/index.min.js',
                    format: 'iife',
                    name: 'jay',
                    plugins: [terser()],
                },
            ],
            context: 'window',
            plugins: [
                typescript(),
                nodeResolve(),
                copy({
                    targets: [
                        { src: './lib-secure/**/*.css', dest: './dist-secure' },
                        { src: './lib-secure/main/index.html', dest: './dist-secure' },
                    ],
                }),
            ],
        },
        {
            input: './lib-secure/sandbox/sandbox-root.ts',
            output: [
                {
                    file: './dist-secure/worker.js',
                    format: 'iife',
                    name: 'jay',
                },
                {
                    file: './dist-secure/worker.min.js',
                    format: 'iife',
                    name: 'jay',
                    plugins: [terser()],
                },
            ],
            context: 'window',
            plugins: [typescript(), nodeResolve()],
        },
    ];
}

export default makeRollupConfig();
