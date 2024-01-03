import {
    CompiledPattern,
    compileFunctionSplitPatternsBlock
} from "../../lib/ts-file/building-blocks/compile-function-split-patterns.ts";
import {mkTransformer} from "../../lib/ts-file/mk-transformer.ts";
import {splitEventHandlerByPatternBlock} from "../../lib/ts-file/building-blocks/split-event-handler-by-pattern.ts";
import {transformCode} from "../test-utils/ts-compiler-test-utils.ts";
import ts, {isExpressionStatement} from "typescript";
import {prettify} from "../../lib";


const PATTERN_EVENT_TARGET_VALUE = `
function inputValuePattern(handler: JayEventHandler<any, any, any>) {
    return handler.event.target.value;
}`;

describe('split event handler by pattern', () => {
    const patterns = compileFunctionSplitPatternsBlock([PATTERN_EVENT_TARGET_VALUE])

    function testTransformer(compiledPatterns: CompiledPattern[]) {
        return mkTransformer(({context, sourceFile, factory}) => {

            return ts.visitEachChild(sourceFile, (statement) => {
                if (isExpressionStatement(statement)) {
                    return ts.visitEachChild(statement, splitEventHandlerByPatternBlock(context, compiledPatterns, factory), context);
                }
                return statement;
            }, context);
        })
    }

    it('should replace call parameter when matching a pattern', async () => {
        const inputEventHandler =
            `({event}) => setText((event.target as HTMLInputElement).value)`
        const transformerState = testTransformer(patterns.val);
        let transformed = await transformCode(inputEventHandler, [transformerState]);

        expect(transformed).toEqual(await prettify(`({event}) => setText(event.$1)`));
        console.log(transformed);

    })
})