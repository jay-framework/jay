import { mkTransformer } from '../../lib/ts-file/mk-transformer.ts';
import ts, { isCallExpression, isExpressionStatement, isFunctionDeclaration } from 'typescript';
import { transformCode } from '../test-utils/ts-compiler-test-utils.ts';
import { prettify } from '../../lib';
import { addEventHandlerCallBlock } from '../../lib/ts-file/building-blocks/add-event-handler-call$.ts';

describe('add event handler call$ to call chain', () => {
    function testTransformer() {
        return mkTransformer(({ context, sourceFile, factory }) => {
            return ts.visitEachChild(
                sourceFile,
                (statement) => {
                    if (
                        isExpressionStatement(statement) &&
                        isCallExpression(statement.expression)
                    ) {
                        return ts.visitNode(
                            statement.expression,
                            addEventHandlerCallBlock(context, factory, 0),
                        );
                    }
                    return statement;
                },
                context,
            );
        });
    }

    it('should support inline event handler', async () => {
        const eventHandlerCall = `refs.comp.onclick(({event}) => {})`;
        const transformerState = testTransformer();
        let transformed = await transformCode(eventHandlerCall, [transformerState]);

        expect(transformed).toEqual(
            await prettify(`refs.comp.onclick$(handler$('0')).onclick(({event}) => {})`),
        );
        console.log(transformed);
    });

    it('should support regular event handler', async () => {
        const eventHandlerCall = `refs.comp.onclick(someHandlerIdentifier)`;
        const transformerState = testTransformer();
        let transformed = await transformCode(eventHandlerCall, [transformerState]);

        expect(transformed).toEqual(
            await prettify(`refs.comp.onclick$(handler$('0')).onclick(someHandlerIdentifier)`),
        );
        console.log(transformed);
    });
});
