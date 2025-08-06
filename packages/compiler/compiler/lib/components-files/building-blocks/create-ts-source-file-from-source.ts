import { withOriginalTrace } from '@jay-framework/compiler-shared';
import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';

const { createSourceFile, ScriptTarget, ScriptKind } = tsBridge;

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
