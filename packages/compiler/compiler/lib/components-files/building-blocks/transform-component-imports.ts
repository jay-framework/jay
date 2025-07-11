import ts, { isImportDeclaration } from 'typescript';
import { codeToAst } from '../ts-utils/ts-compiler-utils';
import { JAY_SECURE } from '@jay-framework/compiler-shared';

function findAfterImportStatementIndex(statements: ts.Node[]) {
    let lastIndex = 0;
    // noinspection LoopStatementThatDoesntLoopJS
    while (isImportDeclaration(statements[lastIndex])) lastIndex += 1;
    return lastIndex;
}

export function transformComponentImports(
    needsHandler$: boolean,
    needsFunc$: boolean,
    needsFuncGlobal$: boolean,
    transformedSourceFile: ts.SourceFile,
    context: ts.TransformationContext,
    factory: ts.NodeFactory,
    sourceFile: ts.SourceFile,
) {
    if (needsHandler$ || needsFunc$ || needsFuncGlobal$) {
        const statements = [...transformedSourceFile.statements];
        const afterImportStatementIndex = findAfterImportStatementIndex(statements);
        const importClause = [
            ...(needsHandler$ ? ['handler$'] : []),
            ...(needsFunc$ ? ['func$'] : []),
            ...(needsFuncGlobal$ ? ['funcGlobal$'] : []),
        ].join(', ');

        const allStatements = [
            ...statements.slice(0, afterImportStatementIndex),
            codeToAst(
                `import { ${importClause} } from '${JAY_SECURE}';`,
                context,
            )[0] as ts.Statement,
            ...statements.slice(afterImportStatementIndex),
        ];
        return factory.updateSourceFile(sourceFile, allStatements);
        // }
    } else return transformedSourceFile;
}
