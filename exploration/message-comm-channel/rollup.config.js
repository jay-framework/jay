// rollup.config.js
import typescript from 'rollup-plugin-typescript2';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default [
    {
        input: './lib/index.ts',
        output: {
            file: 'dist/index.js',
            format: 'iife',
            name: 'jay',
            sourcemap: true,
        },
        plugins: [typescript({ tsconfig: './tsconfig.json' }), nodeResolve()],
    },
    {
        input: './lib/worker.ts',
        output: {
            file: 'dist/worker.js',
            format: 'iife',
            name: 'jay',
            sourcemap: true,
        },
        plugins: [typescript({ tsconfig: './tsconfig.json' }), nodeResolve()],
    },
];
