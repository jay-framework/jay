import ts from 'typescript';
import { createTsSourceFileFromSource } from '../../lib';
import { stripMargin } from './strip-margin.ts';

export function createTsSourceFile(code: string): ts.SourceFile {
    return createTsSourceFileFromSource('dummy.ts', stripMargin(code));
}
