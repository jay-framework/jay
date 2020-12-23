// rollup.config.js
import typescript from '@rollup/plugin-typescript';

export default [
  {
    input: './examples/basic/index.ts',
    output: {
      file: 'dist/basic/index.js',
      format: 'iife',
      name: 'jay'
    },
    plugins: [typescript({})]
  },
  {
    input: './examples/collections/index.ts',
    output: {
      file: 'dist/collections/index.js',
      format: 'umd',
      name: 'jay'
    },
    plugins: [typescript({})]
  },
  {
    input: './examples/conditions/index.ts',
    output: {
      file: 'dist/conditions/index.js',
      format: 'iife',
      name: 'jay'
    },
    plugins: [typescript({})]
  }
];