import {
    CompiledPattern,
    compileFunctionSplitPatternsBlock
} from "../../lib/ts-file/building-blocks/compile-function-split-patterns.ts";
import {mkTransformer} from "../../lib/ts-file/mk-transformer.ts";
import {splitEventHandlerByPatternBlock} from "../../lib/ts-file/building-blocks/split-event-handler-by-pattern.ts";
import {transformCode} from "../test-utils/ts-compiler-test-utils.ts";
import {isExpressionStatement} from "typescript";
import {isFunctionLikeDeclarationBase} from "../../lib/ts-file/ts-compiler-utils.ts";


const PATTERN_EVENT_TARGET_VALUE = `
function inputValuePattern(handler: JayEventHandler<any, any, any>) {
    return handler.event.target.value;
}`;

describe('split event handler by pattern', () => {
    const patterns = compileFunctionSplitPatternsBlock([PATTERN_EVENT_TARGET_VALUE])

    function testTransformer(compiledPatterns: CompiledPattern[]) {
        return mkTransformer(({context, sourceFile}) => {
            if (isExpressionStatement(sourceFile.statements[0]) &&
                isFunctionLikeDeclarationBase(sourceFile.statements[0].expression))
            splitEventHandlerByPatternBlock(context, compiledPatterns)(sourceFile.statements[0].expression);
            return sourceFile;
        })
    }

    it('should replace call parameter when matching a pattern', async () => {
        const inputEventHandler =
            `({event}) => setText((event.target as HTMLInputElement).value)`
        const transformerState = testTransformer(patterns.val);
        let transformed = await transformCode(inputEventHandler, [transformerState]);
        console.log(transformed);

    })
})