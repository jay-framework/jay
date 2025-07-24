import { withOriginalTrace } from '@jay-framework/compiler-shared';
import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const { ScriptTarget, createSourceFile, ScriptKind } = tsModule;

export function createTsSourceFileFromSource(
    filePath: string,
    sourceCode: string,
    scriptKind: ts.ScriptKind = ScriptKind.TS,
): ts.SourceFile {
    try {
        return createSourceFile(filePath, sourceCode, ScriptTarget.Latest, true, scriptKind);
    } catch (error) {
        throw withOriginalTrace(
            new Error(`Failed to create TypeScript source file for ${filePath}`),
            error,
        );
    }
}
