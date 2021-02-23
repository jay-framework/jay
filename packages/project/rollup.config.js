// rollup.config.js
import typescript from '@rollup/plugin-typescript';
import jay from 'rollup-plugin-jay';

export default [
  {
    input: './lib/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'iife',
      name: 'jay'
    },
    plugins: [jay(), typescript()]
  }

];