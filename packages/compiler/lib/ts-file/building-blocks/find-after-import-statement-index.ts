import ts, { isImportDeclaration } from 'typescript';

export function findAfterImportStatementIndex(statements: ts.Node[]) {
    let lastIndex = 0;
    // noinspection LoopStatementThatDoesntLoopJS
    while (isImportDeclaration(statements[lastIndex++])) return lastIndex + 1;
}
