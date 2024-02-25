import {createTsSourceFile} from "../test-utils/ts-source-utils.ts";
import {
    compileFunctionSplitPatternsBlock,
    JayTargetEnv, jayTargetEnvName
} from "../../lib/ts-file/building-blocks/compile-function-split-patterns.ts";
import {
    MatchedPattern,
    SourceFileStatementAnalyzer
} from "../../lib/ts-file/building-blocks/source-file-statement-analyzer.ts";
import {SourceFileBindingResolver} from "../../lib/ts-file/building-blocks/source-file-binding-resolver.ts";
import {ArrowFunction, Block, CallExpression, ExpressionStatement} from "typescript";
import {astToFormattedCode} from "../test-utils/ts-compiler-test-utils.ts";

describe('SourceFileStatementAnalyzer', () => {

    describe('analyze read patterns', () => {
        it('should analyze inline (arrow) event handler with access to event.target.value', async () => {
            const sourceFile = createTsSourceFile(`
            import {JayEvent} from 'jay-runtime';
            ({event}: JayEvent) => setText((event.target as HTMLInputElement).value)`);
            const patterns = readEventTargetValuePattern();
            const bindingResolver = new SourceFileBindingResolver(sourceFile)

            const analyzedFile = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns)

            expect(await printAnalyzedStatements(analyzedFile)).toEqual(new Set([
                `({ event }: JayEvent) => setText((event.target as HTMLInputElement).value); --> sandbox, patterns matched: [0]`
            ]))
            expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([
                '0: (event.target as HTMLInputElement).value; matches inputValuePattern'
            ]))

            const eventHandlerBody = ((sourceFile
                .statements[1] as ExpressionStatement)
                .expression as ArrowFunction)
                .body as CallExpression;
            const eventTargetValueExpression = eventHandlerBody.arguments[0];

            expect(analyzedFile.getExpressionStatus(eventTargetValueExpression))
                .toEqual({
                    expression: eventTargetValueExpression,
                    pattern: patterns[0],
                    testId: 0
                })

            expect(analyzedFile.getStatementStatus(sourceFile.statements[1]))
                .toEqual({
                    targetEnv: JayTargetEnv.sandbox,
                    matchingReadPatterns: [
                        {
                            expression: eventTargetValueExpression,
                            pattern: patterns[0],
                            testId: 0
                        }
                    ]
                })
        })

        it('should analyze block event handler with access to event.target.value', async () => {
            const sourceFile = createTsSourceFile(`
            import {JayEvent} from 'jay-runtime';
            ({event}: JayEvent) => {
                setText((event.target as HTMLInputElement).value)
            }`);
            const patterns = readEventTargetValuePattern();
            const bindingResolver = new SourceFileBindingResolver(sourceFile)

            const analyzedFile = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns)

            expect(await printAnalyzedStatements(analyzedFile)).toEqual(new Set([
                `setText((event.target as HTMLInputElement).value); --> sandbox, patterns matched: [0]`
            ]))
            expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([
                '0: (event.target as HTMLInputElement).value; matches inputValuePattern'
            ]))

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
                    pattern: patterns[0],
                    testId: 0
                })

            expect(analyzedFile.getStatementStatus(eventHandlerBody.statements[0]))
                .toEqual({
                    targetEnv: JayTargetEnv.sandbox,
                    matchingReadPatterns: [
                        {
                            expression: eventTargetValueExpression,
                            pattern: patterns[0],
                            testId: 0
                        }
                    ]
                })
        })
    })
})

async function printMatchedExpression(matchedExpression: MatchedPattern) {
    let printedExpression = (await astToFormattedCode(matchedExpression.expression)).trim();
    return `${matchedExpression.testId}: ${printedExpression} matches ${matchedExpression.pattern.name}`
}

async function printAnalyzedExpressions(analyzer: SourceFileStatementAnalyzer) {
    let printed = new Set<string>();
    for await (let expression of analyzer.getMatchedExpressions()) {
        let matchedPattern = analyzer.getExpressionStatus(expression)
        printed.add(await printMatchedExpression(matchedPattern))
    }
    return printed;
}

async function printAnalyzedStatements(analyzer: SourceFileStatementAnalyzer) {
    let printed = new Set<string>();
    for await (let statement of analyzer.getAnalyzedStatements()) {
        let analysisResult = analyzer.getStatementStatus(statement)
        let printedStatement = (await astToFormattedCode(statement)).trim();
        let patternsMatched = analysisResult.matchingReadPatterns.map(_ => _.testId).sort().join(', ')
        printed.add(`${printedStatement} --> ${jayTargetEnvName(analysisResult.targetEnv)}, patterns matched: [${patternsMatched}]`)
    }
    return printed;
}

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
