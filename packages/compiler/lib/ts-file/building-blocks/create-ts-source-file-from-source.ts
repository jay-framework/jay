import * as ts from 'typescript';
import { withOriginalTrace } from '../../utils/errors';

export function createTsSourceFileFromSource(
    filePath: string,
    sourceCode: string,
    scriptKind: ts.ScriptKind = ts.ScriptKind.TS,
): ts.SourceFile {
    try {
        return ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true, scriptKind);
    } catch (error) {
        throw withOriginalTrace(
            new Error(`Failed to create TypeScript source file for ${filePath}`),
            error,
        );
    }
}
