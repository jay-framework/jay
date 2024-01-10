import {
    CompiledPattern,
    compileFunctionSplitPatternsBlock,
} from '../../lib/ts-file/building-blocks/compile-function-split-patterns';
import { mkTransformer } from '../../lib/ts-file/mk-transformer';
import { splitEventHandlerByPatternBlock } from '../../lib/ts-file/building-blocks/split-event-handler-by-pattern';
import { transformCode } from '../test-utils/ts-compiler-test-utils';
import ts, { isExpressionStatement, isFunctionDeclaration } from 'typescript';
import { prettify } from '../../lib';
import { FoundEventHandler } from '../../lib/ts-file/building-blocks/find-event-handler-functions';

const PATTERN_EVENT_TARGET_VALUE = `
function inputValuePattern(handler: JayEventHandler<any, any, any>) {
    return handler.event.target.value;
}`;

describe('split event handler by pattern', () => {
    const patterns = compileFunctionSplitPatternsBlock([PATTERN_EVENT_TARGET_VALUE]);

    function testTransformer(compiledPatterns: CompiledPattern[]) {
        let callingEventHandlerMock: FoundEventHandler[] = [
            { eventHandlerMatchedPatterns: false } as FoundEventHandler,
        ];
        let transformer = mkTransformer(({ context, sourceFile, factory }) => {
            return ts.visitEachChild(
                sourceFile,
                (statement) => {
                    if (isExpressionStatement(statement)) {
                        return ts.visitEachChild(
                            statement,
                            splitEventHandlerByPatternBlock(
                                context,
                                compiledPatterns,
                                factory,
                                callingEventHandlerMock,
                            ),
                            context,
                        );
                    } else if (isFunctionDeclaration(statement)) {
                        return ts.visitNode(
                            statement,
                            splitEventHandlerByPatternBlock(
                                context,
                                compiledPatterns,
                                factory,
                                callingEventHandlerMock,
                            ),
                        );
                    }
                    return statement;
                },
                context,
            );
        });
        return { transformer, callingEventHandlerMock };
    }

    describe('replace return pattern with identifier', () => {
        it('should replace function call parameter for arrow event handler and mark eventHandlerMatchedPatterns', async () => {
            const inputEventHandler = `({event}) => setText((event.target as HTMLInputElement).value)`;
            const { transformer, callingEventHandlerMock } = testTransformer(patterns.val);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(await prettify(`({event}) => setText(event.$1)`));
            expect(callingEventHandlerMock[0].eventHandlerMatchedPatterns).toBeTruthy();
        });

        it('should replace function call parameter for function event handler and mark eventHandlerMatchedPatterns', async () => {
            const inputEventHandler = `function bla({event}) { setText((event.target as HTMLInputElement).value) }`;
            const { transformer, callingEventHandlerMock } = testTransformer(patterns.val);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`function bla({event}) { setText(event.$1) }`),
            );
            expect(callingEventHandlerMock[0].eventHandlerMatchedPatterns).toBeTruthy();
        });

        it('should not transform and not mark eventHandlerMatchedPatterns if no pattern is matched 1', async () => {
            const inputEventHandler = `function bla({event}) { setText((event.target as HTMLInputElement).keycode) }`;
            const { transformer, callingEventHandlerMock } = testTransformer(patterns.val);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(
                    `function bla({event}) { setText((event.target as HTMLInputElement).keycode) }`,
                ),
            );
            expect(callingEventHandlerMock[0].eventHandlerMatchedPatterns).toBeFalsy();
        });

        it('should not transform and not mark eventHandlerMatchedPatterns if no pattern is matched 2', async () => {
            const inputEventHandler = `function bla({event}) { setCount(count() + 1) }`;
            const { transformer, callingEventHandlerMock } = testTransformer(patterns.val);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`function bla({event}) { setCount(count() + 1) }`),
            );
            expect(callingEventHandlerMock[0].eventHandlerMatchedPatterns).toBeFalsy();
        });
    });
});
