import { CompilerOptions } from 'typescript';

export interface JayRollupConfig {
    tsConfigFilePath?: string;
    tsCompilerOptionsOverrides?: CompilerOptions;
    outputDir?: string;
    isWorker?: boolean; // only applicable for rollup, vite detects it from worker import
    compilerPatternFiles?: string[]
}
