import * as ts from 'typescript';
import { JayRollupConfig } from '../common/types';
import path from 'node:path';
import {
    createTsSourceFileFromSource,
    compileFunctionSplitPatternsBlock,
    FunctionRepositoryBuilder,
} from '@jay-framework/compiler';
import { CompiledPattern } from '@jay-framework/compiler';
import fs from 'fs';
import { CompilerSourceFile } from '@jay-framework/compiler-shared';

export class JayPluginContext {
    readonly projectRoot: string;
    readonly outputDir: string;
    readonly tsPrinter: ts.Printer;
    readonly compilerPatterns: CompiledPattern[];
    readonly jayFileCache = new Map<string, CompilerSourceFile>();
    readonly globalFunctionsRepository: FunctionRepositoryBuilder;

    constructor(readonly jayOptions: JayRollupConfig = {}) {
        this.projectRoot = path.dirname(jayOptions.tsConfigFilePath ?? process.cwd());
        this.outputDir = jayOptions.outputDir && path.join(this.projectRoot, jayOptions.outputDir);
        this.tsPrinter = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
        let compilerPatternsParseResult = compileFunctionSplitPatternsBlock(
            (jayOptions.compilerPatternFiles || []).map((fileName) => {
                let fileContent = fs.readFileSync(fileName, { encoding: 'utf8' });
                return createTsSourceFileFromSource(fileName, fileContent);
            }),
        );
        if (compilerPatternsParseResult.validations.length > 0)
            throw new Error(
                'failed to parse or validate compilerPatternFiles. \n' +
                    compilerPatternsParseResult.validations.join('\n'),
            );
        this.compilerPatterns = compilerPatternsParseResult.val;
        this.globalFunctionsRepository = new FunctionRepositoryBuilder();
    }

    cacheJayFile(id: string, jayFile: CompilerSourceFile): CompilerSourceFile {
        console.info('[cache] set', id);
        this.jayFileCache.set(id, jayFile);
        return jayFile;
    }

    getCachedJayFile(id: string): CompilerSourceFile {
        const jayFile = this.jayFileCache.get(id);
        if (Boolean(jayFile)) {
            console.info('[cache] hit', id);
        }
        return jayFile;
    }

    deleteCachedJayFile(id: string): boolean {
        return this.jayFileCache.delete(id);
    }
}
