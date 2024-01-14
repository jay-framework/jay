import {
    CompiledPattern,
    compileFunctionSplitPatternsBlock,
} from '../../lib/ts-file/building-blocks/compile-function-split-patterns';
import { mkTransformer } from '../../lib/ts-file/mk-transformer';
import {
    TransformedEventHandlerByPattern,
    transformEventHandlerByPatternBlock,
} from '../../lib/ts-file/building-blocks/transform-event-handler-by-pattern';
import { transformCode } from '../test-utils/ts-compiler-test-utils';
import ts, { isArrowFunction, isFunctionDeclaration } from 'typescript';
import { prettify } from '../../lib';

const PATTERN_EVENT_TARGET_VALUE = `
function inputValuePattern(handler: JayEventHandler<any, any, any>) {
    return handler.event.target.value;
}`;

describe('split event handler by pattern', () => {
    const patterns = compileFunctionSplitPatternsBlock([PATTERN_EVENT_TARGET_VALUE]);

    function testTransformer(compiledPatterns: CompiledPattern[]) {
        let splitEventHandlers: TransformedEventHandlerByPattern[] = [];
        let transformer = mkTransformer(({ context, sourceFile, factory }) => {
            const visitor = (node) => {
                if (isFunctionDeclaration(node) || isArrowFunction(node)) {
                    let splitEventHandler = transformEventHandlerByPatternBlock(
                        context,
                        compiledPatterns,
                        factory,
                        node,
                    );
                    splitEventHandlers.push(splitEventHandler);
                    return splitEventHandler.transformedEventHandler;
                }
                return ts.visitEachChild(node, visitor, context);
            };
            return ts.visitEachChild(sourceFile, visitor, context);
        });
        return { transformer, splitEventHandlers };
    }

    describe('replace return pattern with identifier', () => {
        it('should replace function call parameter for arrow event handler and mark eventHandlerMatchedPatterns', async () => {
            const inputEventHandler = `({event}) => setText((event.target as HTMLInputElement).value)`;
            const { transformer, splitEventHandlers } = testTransformer(patterns.val);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(await prettify(`({event}) => setText(event.$0)`));
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await prettify(splitEventHandlers[0].functionRepositoryFragment)).toEqual(
                await prettify(`({ event }) => ({$0: event.target.value})`));
        });

        it('should replace function call parameter for function event handler and mark eventHandlerMatchedPatterns', async () => {
            const inputEventHandler = `function bla({event}) { setText((event.target as HTMLInputElement).value) }`;
            const { transformer, splitEventHandlers } = testTransformer(patterns.val);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`function bla({event}) { setText(event.$0) }`),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await prettify(splitEventHandlers[0].functionRepositoryFragment)).toEqual(
                await prettify(`({ event }) => ({$0: event.target.value})`));
        });

        it('should not transform and not mark eventHandlerMatchedPatterns if no pattern is matched 1', async () => {
            const inputEventHandler = `function bla({event}) { setText((event.target as HTMLInputElement).keycode) }`;
            const { transformer, splitEventHandlers } = testTransformer(patterns.val);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(
                    `function bla({event}) { setText((event.target as HTMLInputElement).keycode) }`,
                ),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeFalsy();
            expect(splitEventHandlers[0].functionRepositoryFragment).not.toBeDefined();
        });

        it('should not transform and not mark eventHandlerMatchedPatterns if no pattern is matched 2', async () => {
            const inputEventHandler = `function bla({event}) { setCount(count() + 1) }`;
            const { transformer, splitEventHandlers } = testTransformer(patterns.val);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`function bla({event}) { setCount(count() + 1) }`),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeFalsy();
            expect(splitEventHandlers[0].functionRepositoryFragment).not.toBeDefined();
        });
    });
});
