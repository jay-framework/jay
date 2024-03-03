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
import {astToFormattedCode, printStatementWithoutChildStatements} from "../test-utils/ts-compiler-test-utils.ts";

describe('SourceFileStatementAnalyzer', () => {

    describe('analyze read patterns', () => {

        describe('test also the getExpressionStatus and getStatementStatus APIs', () => {
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
                        patterns: [patterns[0]],
                        testId: 0
                    })

                expect(analyzedFile.getStatementStatus(sourceFile.statements[1]))
                    .toEqual({
                        targetEnv: JayTargetEnv.sandbox,
                        matchedPatterns: [
                            {
                                expression: eventTargetValueExpression,
                                patterns: [patterns[0]],
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
                        patterns: [patterns[0]],
                        testId: 0
                    })

                expect(analyzedFile.getStatementStatus(eventHandlerBody.statements[0]))
                    .toEqual({
                        targetEnv: JayTargetEnv.sandbox,
                        matchedPatterns: [
                            {
                                expression: eventTargetValueExpression,
                                patterns: [patterns[0]],
                                testId: 0
                            }
                        ]
                    })
            })
        })

        it('basic read pattern', async () => {
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
        })

        it('chaining multiple read patterns', async () => {
            const sourceFile = createTsSourceFile(`
                    import {JayEvent} from 'jay-runtime';
                    ({event}: JayEvent) => setText((event.target as HTMLInputElement).value.length)`);
            const patterns = [...readEventTargetValuePattern(), ...stringLengthPattern()];
            const bindingResolver = new SourceFileBindingResolver(sourceFile)

            const analyzedFile = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns)

            expect(await printAnalyzedStatements(analyzedFile)).toEqual(new Set([
                `({ event }: JayEvent) => setText((event.target as HTMLInputElement).value.length); --> sandbox, patterns matched: [0]`
            ]))
            expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([
                '0: (event.target as HTMLInputElement).value.length; matches inputValuePattern, stringLength'
            ]))
        })

        it('match pattern as sub-expression of chaining', async () => {
            const sourceFile = createTsSourceFile(`
                    import {JayEvent} from 'jay-runtime';
                    ({event}: JayEvent) => setText((event.target as HTMLInputElement).value.length)`);
            const patterns = readEventTargetValuePattern();
            const bindingResolver = new SourceFileBindingResolver(sourceFile)

            const analyzedFile = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns)

            expect(await printAnalyzedStatements(analyzedFile)).toEqual(new Set([
                `({ event }: JayEvent) => setText((event.target as HTMLInputElement).value.length); --> sandbox, patterns matched: [0]`
            ]))
            expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([
                '0: (event.target as HTMLInputElement).value; matches inputValuePattern'
            ]))
        })

        it('not find match if the code does not match', async () => {
            const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => setText((event.target as HTMLInputElement).width)`);
            const patterns = readEventTargetValuePattern();
            const bindingResolver = new SourceFileBindingResolver(sourceFile)

            const analyzedFile = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns)

            expect(await printAnalyzedStatements(analyzedFile)).toEqual(new Set([
                `({ event }: JayEvent) => setText((event.target as HTMLInputElement).width); --> sandbox, patterns matched: []`
            ]))
            expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([]))
        })

        it('should support if statement', async () => {
            const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    if ((event.target as HTMLInputElement).value)
                        setText((event.target as HTMLInputElement).value)
                }`);
            const patterns = readEventTargetValuePattern();
            const bindingResolver = new SourceFileBindingResolver(sourceFile)

            const analyzedFile = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns)

            expect(await printAnalyzedStatements(analyzedFile)).toEqual(new Set([
                `if ((event.target as HTMLInputElement).value) /*...*/ --> main, patterns matched: [0]`,
                `setText((event.target as HTMLInputElement).value); --> sandbox, patterns matched: [1]`
            ]))
            expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([
                "0: (event.target as HTMLInputElement).value; matches inputValuePattern",
                "1: (event.target as HTMLInputElement).value; matches inputValuePattern",
            ]))
        })

    })

    describe('statements that require code running in sandbox', () => {

        it('mandate for statement in sandbox', async () => {
            const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    for (let i=0; i < (event.target as HTMLInputElement).value.length; i++)
                        console.log(i);
                }`);
            const patterns = readEventTargetValuePattern();
            const bindingResolver = new SourceFileBindingResolver(sourceFile)

            const analyzedFile = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns)

            expect(await printAnalyzedStatements(analyzedFile)).toEqual(new Set([
                `for (let i = 0; i < (event.target as HTMLInputElement).value.length; i++) /*...*/ --> sandbox, patterns matched: []`,
            ]))
            expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([]))
        })

        it('mandate for in statement in sandbox', async () => {
            const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    for (let i in (event.target as HTMLInputElement).value)
                        console.log(i);
                }`);
            const patterns = readEventTargetValuePattern();
            const bindingResolver = new SourceFileBindingResolver(sourceFile)

            const analyzedFile = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns)

            expect(await printAnalyzedStatements(analyzedFile)).toEqual(new Set([
                `for (let i in (event.target as HTMLInputElement).value) /*...*/ --> sandbox, patterns matched: []`,
            ]))
            expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([]))
        })

        it('mandate for of statement in sandbox', async () => {
            const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    for (let i of (event.target as HTMLInputElement).value)
                        console.log(i);
                }`);
            const patterns = readEventTargetValuePattern();
            const bindingResolver = new SourceFileBindingResolver(sourceFile)

            const analyzedFile = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns)

            expect(await printAnalyzedStatements(analyzedFile)).toEqual(new Set([
                `for (let i of (event.target as HTMLInputElement).value) /*...*/ --> sandbox, patterns matched: []`,
            ]))
            expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([]))
        })

        it('mandate do while statement in sandbox', async () => {
            const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    do {
                        console.log((event.target as HTMLInputElement).value);
                    } while((event.target as HTMLInputElement).value != 'ok')
                }`);
            const patterns = readEventTargetValuePattern();
            const bindingResolver = new SourceFileBindingResolver(sourceFile)

            const analyzedFile = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns)

            expect(await printAnalyzedStatements(analyzedFile)).toEqual(new Set([
                `do /*...*/ while ((event.target as HTMLInputElement).value != 'ok'); --> sandbox, patterns matched: []`,
            ]))
            expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([]))
        })

        it('mandate while statement in sandbox', async () => {
            const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    while((event.target as HTMLInputElement).value != 'ok') {
                        console.log((event.target as HTMLInputElement).value);
                    } 
                }`);
            const patterns = readEventTargetValuePattern();
            const bindingResolver = new SourceFileBindingResolver(sourceFile)

            const analyzedFile = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns)

            expect(await printAnalyzedStatements(analyzedFile)).toEqual(new Set([
                `while ((event.target as HTMLInputElement).value != 'ok') /*...*/ --> sandbox, patterns matched: []`,
            ]))
            expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([]))

        })
    })

    describe('analyze assignment patterns', () => {
        it('should support setting event.target.value to a constant', async () => {
            const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    (event.target as HTMLInputElement).value = '12';
                }`);
            const patterns = setEventTargetValuePattern();
            const bindingResolver = new SourceFileBindingResolver(sourceFile)

            const analyzedFile = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns)

            expect(await printAnalyzedStatements(analyzedFile)).toEqual(new Set([
                `(event.target as HTMLInputElement).value = '12'; --> main, patterns matched: [0]`,
            ]))
            expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([
                "0: (event.target as HTMLInputElement).value; matches setEventTargetValue",
            ]))
        })

    })

    describe('analyze function calls', () => {
        it('should support call patterns', async () => {
            const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    event.preventDefault();
                }`);
            const patterns = eventPreventDefaultPattern();
            const bindingResolver = new SourceFileBindingResolver(sourceFile)

            const analyzedFile = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns)

            expect(await printAnalyzedStatements(analyzedFile)).toEqual(new Set([
                "event.preventDefault(); --> main, patterns matched: [0]",
            ]))
            expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([
                "0: event.preventDefault(); matches eventPreventDefault",
            ]))
        })

        it('should support value replace on input', async () => {
            const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    event.target.value = event.target.value.replace(/[^A-Za-z0-9]+/g, '');
                }`);
            const patterns = [...setEventTargetValuePattern(), ...readEventTargetValuePattern(), ...stringReplacePattern()];
            const bindingResolver = new SourceFileBindingResolver(sourceFile)

            const analyzedFile = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns)

            expect(await printAnalyzedStatements(analyzedFile)).toEqual(new Set([
                "event.target.value = event.target.value.replace(/[^A-Za-z0-9]+/g, ''); --> main, patterns matched: [0, 1]",
            ]))
            expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([
                "0: event.target.value.replace(/[^A-Za-z0-9]+/g, ''); matches inputValuePattern, stringReplace",
                "1: event.target.value; matches setEventTargetValue",
            ]))
        })

        it.skip('should support value replace on input with intermidiate variables', async () => {
            const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    const inputValue = event.target.value;
                    const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, '');
                    event.target.value = validValue;
                }`);
            const patterns = [...setEventTargetValuePattern(), ...readEventTargetValuePattern(), ...stringReplacePattern()];
            const bindingResolver = new SourceFileBindingResolver(sourceFile)

            const analyzedFile = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns)

            expect(await printAnalyzedStatements(analyzedFile)).toEqual(new Set([
                "const inputValue = event.target.value; --> main, patterns matched: [0]",
                "const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, ''); --> main, patterns matched: [1]",
                "event.target.value = validValue; --> main, patterns matched: [2]",
            ]))
            expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([
                "0: const inputValue = event.target.value; matches readEventTargetValue",
                "1: const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, ''); matches stringReplace",
                "2: event.target.value = validValue; matches setEventTargetValue",
            ]))
        })
    })
})

async function printMatchedExpression(matchedExpression: MatchedPattern) {
    let printedExpression = (await astToFormattedCode(matchedExpression.expression)).trim();
    return `${matchedExpression.testId}: ${printedExpression} matches ${matchedExpression.patterns.map(_ => _.name).join(', ')}`
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
        let printedStatement = (await printStatementWithoutChildStatements(statement)).trim();
        let patternsMatched = analysisResult.matchedPatterns.map(_ => _.testId).sort().join(', ')
        printed.add(`${printedStatement} --> ${jayTargetEnvName(analysisResult.targetEnv)}, patterns matched: [${patternsMatched}]`)
    }
    return printed;
}

function readEventTargetValuePattern() {
    return compileFunctionSplitPatternsBlock([createTsSourceFile(`
    import {JayEvent} from 'jay-runtime';
    function inputValuePattern({event}: JayEvent<any, any>): string {
        return event.target.value;
    }`)]).val;
}

function stringLengthPattern() {
    return compileFunctionSplitPatternsBlock([createTsSourceFile(`
    @JayPattern(JayTargetEnv.any)
    function stringLength(value: string): string {
        return value.length;
    }`)]).val;
}

function stringReplacePattern() {
    return compileFunctionSplitPatternsBlock([createTsSourceFile(`
    @JayPattern(JayTargetEnv.any)
    function stringReplace(value: string, regex: RegExp): string {
        return value.replace(regex);
    }`)]).val;
}

function eventPreventDefaultPattern() {
    return compileFunctionSplitPatternsBlock([createTsSourceFile(`
    import {JayEvent} from 'jay-runtime';
    function eventPreventDefault({event}: JayEvent<any, any>) {
        event.preventDefault();
    }`)]).val;
}

function setEventTargetValuePattern() {
    return compileFunctionSplitPatternsBlock([createTsSourceFile(`
    import {JayEvent} from 'jay-runtime';
    function setEventTargetValue({event}: JayEvent<any, any>, value: string) {
        event.target.value = value
    }`)]).val;
}
