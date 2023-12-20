// rollup.config.js
import { defineConfig } from 'rollup';
import typescript from 'rollup-plugin-typescript2';
import { terser } from 'rollup-plugin-terser';
import { jayRuntime } from 'rollup-plugin-jay';
import copy from 'rollup-plugin-copy';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import path from 'node:path';

const rollupConfig = defineConfig([
    {
        input: './lib/index.ts',
        output: [
            {
                file: './dist/index.js',
                format: 'iife',
                name: 'jay',
                sourcemap: false,
            },
            {
                file: './dist/index.min.js',
                format: 'iife',
                name: 'jay',
                plugins: [terser()],
                sourcemap: false,
            },
        ],
        context: 'window',
        plugins: [
            jayRuntime({
                tsConfigFilePath: path.join(process.cwd(), 'tsconfig.json'),
                outputDir: 'build',
            }),
            // generating virtual files, static type checker cannot resolve them
            typescript({ check: false }),
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
                sourcemap: true,
            },
            {
                file: './dist-secure/index.min.js',
                format: 'iife',
                name: 'jay',
                plugins: [terser()],
                sourcemap: true,
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
        input: './lib-secure/sandbox/worker-root.ts',
        output: [
            {
                file: './dist-secure/worker.js',
                format: 'iife',
                name: 'jay',
                sourcemap: true,
            },
            {
                file: './dist-secure/worker.min.js',
                format: 'iife',
                name: 'jay',
                plugins: [terser()],
                sourcemap: true,
            },
        ],
        context: 'window',
        plugins: [typescript(), nodeResolve()],
    },
]);

export default rollupConfig;
