import * as ts from 'typescript';
import { withOriginalTrace } from '../../utils/errors';

export function createTsSourceFileFromSource(filePath: string, sourceCode: string): ts.SourceFile {
    try {
        return ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);
    } catch (error) {
        throw withOriginalTrace(
            new Error(`Failed to create TypeScript source file for ${filePath}`),
            error,
        );
    }
}
