import { resolve } from 'path';
import { defineConfig } from 'vite';
import { jayStackCompiler } from '@jay-framework/compiler-jay-stack';

const jayOptions = {
    tsConfigFilePath: resolve(__dirname, 'tsconfig.json'),
    outputDir: 'build',
};

export default defineConfig({
    plugins: [...jayStackCompiler(jayOptions)],
});
