import ts from 'typescript';
import { createTsSourceFileFromSource } from '../../lib';
import { stripMargin } from './strip-margin';

export function createTsSourceFile(code: string): ts.SourceFile {
    return createTsSourceFileFromSource('dummy.ts', stripMargin(code));
}

export function createTsxSourceFile(code: string): ts.SourceFile {
    return createTsSourceFileFromSource('dummy.ts', stripMargin(code), ts.ScriptKind.TSX);
}
