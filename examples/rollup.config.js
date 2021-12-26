// rollup.config.js
import typescript from '@rollup/plugin-typescript';
import jay from 'rollup-plugin-jay';
import copy from 'rollup-plugin-copy'
import { nodeResolve } from '@rollup/plugin-node-resolve';
import {promises as fs} from "fs";
import path from "path";

async function findAllEntryPoints(dir) {
  let files = await fs.readdir(dir);
  let entrypoints = [];
  for (let file of files)
    if ((await fs.stat(dir + "/" + file)).isDirectory())
      entrypoints = [...entrypoints, ...await findAllEntryPoints(dir + "/" + file)]
    else if (file === 'index.ts')
      entrypoints.push(path.join(__dirname, dir, "/", file))

  return entrypoints;
}

async function makeRollupConfig() {
  let entrypoints = await findAllEntryPoints('./lib');
  let config =  entrypoints.map(ep => {
    let srcFolder = path.dirname(ep);
    let destFolder = srcFolder.replace('/examples/lib', '/examples/dist');
    return {
      input: ep,
      output: {
        file: ep.replace('/examples/lib/', '/examples/dist/').replace('.ts', '.js'),
        format: 'iife',
        name: 'jay'
      },
      context: 'window',
      plugins: [
        jay(),
        typescript(),
        nodeResolve(),
        copy({
          targets: [
            {src: path.join(srcFolder, '**/*.css'), dest: destFolder},
            {src: path.join(srcFolder, 'index.html'), dest: destFolder}
          ]
        })]
    }
  })
  return config;
}

export default makeRollupConfig();