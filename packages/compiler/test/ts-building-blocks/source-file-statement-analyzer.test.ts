import {createTsSourceFile} from "../test-utils/ts-source-utils.ts";
import {
    compileFunctionSplitPatternsBlock,
    JayTargetEnv
} from "../../lib/ts-file/building-blocks/compile-function-split-patterns.ts";
import {SourceFileStatementAnalyzer} from "../../lib/ts-file/building-blocks/source-file-statement-analyzer.ts";
import {SourceFileBindingResolver} from "../../lib/ts-file/building-blocks/source-file-binding-resolver.ts";
import {ArrowFunction, Block, CallExpression, ExpressionStatement} from "typescript";


function readEventTargetValuePattern() {
    const PATTERN_EVENT_TARGET_VALUE = createTsSourceFile(`
    import {JayEvent} from 'jay-runtime';
    function inputValuePattern({event}: JayEvent<any, any>): string {
        return event.target.value;
    }`);

    return compileFunctionSplitPatternsBlock([PATTERN_EVENT_TARGET_VALUE]).val;
}

function eventPreventDefaultPattern() {
    const PATTERN_EVENT_PREVENT_DEFAULT = createTsSourceFile(`
    import {JayEvent} from 'jay-runtime';
    function inputValuePattern({event}: JayEvent<any, any>) {
        event.preventDefault();
    }`);

    return compileFunctionSplitPatternsBlock([PATTERN_EVENT_PREVENT_DEFAULT]).val;
}

describe('SourceFileStatementAnalyzer', () => {

    describe('analyze read patterns', () => {
        it('should analyze inline (arrow) event handler with access to event.target.value', () => {
            const sourceFile = createTsSourceFile(`
            import {JayEvent} from 'jay-runtime';
            ({event}: JayEvent) => setText((event.target as HTMLInputElement).value)`);
            const patterns = readEventTargetValuePattern();
            const bindingResolver = new SourceFileBindingResolver(sourceFile)

            const analyzedFile = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns)

            const eventHandlerBody = ((sourceFile
                .statements[1] as ExpressionStatement)
                .expression as ArrowFunction)
                .body as CallExpression;
            const eventTargetValueExpression = eventHandlerBody.arguments[0];

            expect(analyzedFile.getExpressionStatus(eventTargetValueExpression))
                .toEqual({
                    expression: eventTargetValueExpression,
                    pattern: patterns[0]
                })

            expect(analyzedFile.getStatementStatus(sourceFile.statements[1]))
                .toEqual({
                    targetEnv: JayTargetEnv.sandbox,
                    matchingReadPatterns: [
                        {
                            expression: eventTargetValueExpression,
                            pattern: patterns[0]
                        }
                    ]
                })
        })

        it('should analyze block event handler with access to event.target.value', () => {
            const sourceFile = createTsSourceFile(`
            import {JayEvent} from 'jay-runtime';
            ({event}: JayEvent) => {
                setText((event.target as HTMLInputElement).value)
            }`);
            const patterns = readEventTargetValuePattern();
            const bindingResolver = new SourceFileBindingResolver(sourceFile)

            const analyzedFile = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns)

            const eventHandlerBody = ((sourceFile
                .statements[1] as ExpressionStatement)
                .expression as ArrowFunction)
                .body as Block;
            const eventTargetValueExpression = ((eventHandlerBody
                .statements[0] as ExpressionStatement)
                .expression as CallExpression)
                .arguments[0];

            expect(analyzedFile.getExpressionStatus(eventTargetValueExpression))
                .toEqual({
                    expression: eventTargetValueExpression,
                    pattern: patterns[0]
                })

            expect(analyzedFile.getStatementStatus(eventHandlerBody.statements[0]))
                .toEqual({
                    targetEnv: JayTargetEnv.sandbox,
                    matchingReadPatterns: [
                        {
                            expression: eventTargetValueExpression,
                            pattern: patterns[0]
                        }
                    ]
                })
        })
    })
})