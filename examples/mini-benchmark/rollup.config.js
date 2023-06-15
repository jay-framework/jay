// rollup.config.js
import typescript from '@rollup/plugin-typescript';
import { terser } from "rollup-plugin-terser";
import jay from 'rollup-plugin-jay';
import copy from 'rollup-plugin-copy'
import { nodeResolve } from '@rollup/plugin-node-resolve';

async function makeRollupConfig() {
  return {
    input: './lib/index.ts',
    output: [
      {
        file: './dist/index.js',
        format: 'iife',
        name: 'jay'
      },
      {
        file: './dist/index.min.js',
        format: 'iife',
        name: 'jay',
        plugins: [terser()]
      }],
    context: 'window',
    plugins: [
      jay(),
      typescript(),
      nodeResolve(),
      copy({
        targets: [
          {src: './lib/**/*.css', dest: './dist'},
          {src: './lib/index.html', dest: './dist'}
        ]
      })]
  }
}

export default makeRollupConfig();