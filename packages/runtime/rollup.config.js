// rollup.config.js
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default [
  {
    input: './examples/index.ts',
    output: {
      file: 'build/index.js',
      format: 'iife',
      name: 'jay'
    },
    plugins: [typescript({tsconfig: './tsconfig-examples.json'}), nodeResolve()]
  }

];