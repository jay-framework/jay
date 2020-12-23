// rollup.config.js
import typescript from '@rollup/plugin-typescript';

export default [
  {
    input: './examples/basic/output.tsx',
    output: {
      file: 'dist/basic/output.js',
      format: 'umd',
      name: 'jay'
    },
    plugins: [typescript({})]
  },
  {
    input: './examples/collections/output.tsx',
    output: {
      file: 'dist/collections/output.js',
      format: 'umd',
      name: 'jay'
    },
    plugins: [typescript({})]
  },
  {
    input: './examples/conditions/output.tsx',
    output: {
      file: 'dist/conditions/output.js',
      format: 'umd',
      name: 'jay'
    },
    plugins: [typescript({})]
  }
];