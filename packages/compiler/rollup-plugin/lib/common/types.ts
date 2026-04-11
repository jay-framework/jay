import { GenerateTarget } from '@jay-framework/compiler-shared';
import * as ts from 'typescript';

export interface JayRollupConfig {
    tsConfigFilePath?: string;
    tsCompilerOptionsOverrides?: ts.CompilerOptions;
    outputDir?: string;
    isWorker?: boolean; // only applicable for rollup, vite detects it from worker import
    compilerPatternFiles?: string[];
    generationTarget?: GenerateTarget;
    /** Pages source root directory (for mapping pre-rendered paths back to source) */
    pagesRoot?: string;
    /** Build output directory (for detecting pre-rendered files) */
    buildFolder?: string;
}
