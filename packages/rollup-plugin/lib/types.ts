import { CompilerOptions } from 'typescript';

export interface JayRollupConfig {
    tsConfigFilePath?: string;
    tsCompilerOptionsOverrides?: CompilerOptions;
    outputDir?: string;
}
