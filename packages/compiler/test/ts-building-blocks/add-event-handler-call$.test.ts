import { mkTransformer } from '../../lib/ts-file/mk-transformer';
import ts, { isCallExpression, isExpressionStatement, isFunctionDeclaration } from 'typescript';
import { transformCode } from '../test-utils/ts-compiler-test-utils';
import { prettify } from '../../lib';
import { addEventHandlerCallBlock } from '../../lib/ts-file/building-blocks/add-event-handler-call$';

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
                            addEventHandlerCallBlock(context, factory),
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
            await prettify(`refs.comp.onclick$(handler$('1')).onclick(({event}) => {})`),
        );
        console.log(transformed);
    });

    it('should support regular event handler', async () => {
        const eventHandlerCall = `refs.comp.onclick(someHandlerIdentifier)`;
        const transformerState = testTransformer();
        let transformed = await transformCode(eventHandlerCall, [transformerState]);

        expect(transformed).toEqual(
            await prettify(`refs.comp.onclick$(handler$('1')).onclick(someHandlerIdentifier)`),
        );
        console.log(transformed);
    });
});
