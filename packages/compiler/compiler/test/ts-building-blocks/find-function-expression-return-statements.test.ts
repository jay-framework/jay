import ts from 'typescript';
import { createTsSourceFile } from '../test-utils/ts-source-utils';
import { findFunctionExpressionReturnStatements } from '../../lib/ts-file/building-blocks/find-function-expression-return-statements';

describe('findFunctionExpressionReturnStatement', () => {
    function findReturns(sourceFile: ts.SourceFile) {
        return findFunctionExpressionReturnStatements(
            sourceFile.statements[0] as unknown as ts.FunctionLikeDeclarationBase,
        );
    }

    const sourceFile = createTsSourceFile(`
function CounterConstructor({ initialValue }: Props<CounterProps>) {
    let [count] = createSignal(initialValue);
    return {
        render: () => (<div>{count()}</div>);
    };
}
        `);

    it('finds return statements', async () => {
        const returnStatements = findReturns(sourceFile);
        expect(returnStatements).toHaveLength(1);
        expect(returnStatements[0].getText()).toMatch('return');
    });

    describe('on more than one return statement', () => {
        const sourceFile = createTsSourceFile(`
function CounterConstructor({ initialValue }: Props<CounterProps>) {
    let [count] = createSignal(initialValue);
    if (count() > 0) {
        return {
            render: () => (<div>{count()}</div>);
        };
    } else {
        return {
            render: () => (<div>Zero state</div>);
        };
    }
}
        `);

        it('finds all the return statements', async () => {
            const returnStatements = findReturns(sourceFile);
            expect(returnStatements).toHaveLength(2);
        });
    });
});
