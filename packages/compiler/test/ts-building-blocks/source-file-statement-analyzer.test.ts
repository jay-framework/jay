import { createTsSourceFile } from '../test-utils/ts-source-utils';
import {
    JayTargetEnv,
    jayTargetEnvName,
} from '../../lib/ts-file/building-blocks/compile-function-split-patterns';
import {
    MatchedPattern,
    ScopedSourceFileStatementAnalyzer,
} from '../../lib/ts-file/building-blocks/scoped-source-file-statement-analyzer';
import { SourceFileBindingResolver } from '../../lib/ts-file/building-blocks/source-file-binding-resolver';
import { ArrowFunction, Block, CallExpression, ExpressionStatement } from 'typescript';
import {
    astToFormattedCode,
    printStatementWithoutChildStatements,
} from '../test-utils/ts-compiler-test-utils';
import {
    consoleLog, consoleLogVarargs,
    eventPreventDefaultPattern,
    readEventKeyCodePattern,
    readEventTargetValuePattern,
    setEventTargetValuePattern,
    stringLengthPattern,
    stringReplacePattern,
} from './compiler-patterns-for-testing';

describe('SourceFileStatementAnalyzer', () => {

    describe('event handlers', () => {
        describe('statements that require code running in sandbox', () => {
            it('mandate for statement in sandbox', async () => {
                const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    for (let i=0; i < (event.target as HTMLInputElement).value.length; i++)
                        console.log(i);
                }`);
                const patterns = readEventTargetValuePattern();
                const bindingResolver = new SourceFileBindingResolver(sourceFile);

                const analyzedFile = new ScopedSourceFileStatementAnalyzer(
                    sourceFile,
                    bindingResolver,
                    patterns,
                    sourceFile.getChildren()[1]
                );

                expect(await printAnalyzedStatements(analyzedFile)).toEqual(
                    new Set([
                        `for (let i = 0; i < (event.target as HTMLInputElement).value.length; i++) /*...*/ --> sandbox, patterns matched: []`,
                    ]),
                );
                expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([]));
            });

            it('mandate for in statement in sandbox', async () => {
                const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    for (let i in (event.target as HTMLInputElement).value)
                        console.log(i);
                }`);
                const patterns = readEventTargetValuePattern();
                const bindingResolver = new SourceFileBindingResolver(sourceFile);

                const analyzedFile = new ScopedSourceFileStatementAnalyzer(
                    sourceFile,
                    bindingResolver,
                    patterns,
                    sourceFile.getChildren()[1]
                );

                expect(await printAnalyzedStatements(analyzedFile)).toEqual(
                    new Set([
                        `for (let i in (event.target as HTMLInputElement).value) /*...*/ --> sandbox, patterns matched: []`,
                    ]),
                );
                expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([]));
            });

            it('mandate for of statement in sandbox', async () => {
                const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    for (let i of (event.target as HTMLInputElement).value)
                        console.log(i);
                }`);
                const patterns = readEventTargetValuePattern();
                const bindingResolver = new SourceFileBindingResolver(sourceFile);

                const analyzedFile = new ScopedSourceFileStatementAnalyzer(
                    sourceFile,
                    bindingResolver,
                    patterns,
                    sourceFile.getChildren()[1]
                );

                expect(await printAnalyzedStatements(analyzedFile)).toEqual(
                    new Set([
                        `for (let i of (event.target as HTMLInputElement).value) /*...*/ --> sandbox, patterns matched: []`,
                    ]),
                );
                expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([]));
            });

            it('mandate do while statement in sandbox', async () => {
                const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    do {
                        console.log((event.target as HTMLInputElement).value);
                    } while((event.target as HTMLInputElement).value != 'ok')
                }`);
                const patterns = readEventTargetValuePattern();
                const bindingResolver = new SourceFileBindingResolver(sourceFile);

                const analyzedFile = new ScopedSourceFileStatementAnalyzer(
                    sourceFile,
                    bindingResolver,
                    patterns,
                    sourceFile.getChildren()[1]
                );

                expect(await printAnalyzedStatements(analyzedFile)).toEqual(
                    new Set([
                        `do /*...*/ while ((event.target as HTMLInputElement).value != 'ok'); --> sandbox, patterns matched: []`,
                    ]),
                );
                expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([]));
            });

            it('mandate while statement in sandbox', async () => {
                const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    while((event.target as HTMLInputElement).value != 'ok') {
                        console.log((event.target as HTMLInputElement).value);
                    } 
                }`);
                const patterns = readEventTargetValuePattern();
                const bindingResolver = new SourceFileBindingResolver(sourceFile);

                const analyzedFile = new ScopedSourceFileStatementAnalyzer(
                    sourceFile,
                    bindingResolver,
                    patterns,
                    sourceFile.getChildren()[1]
                );

                expect(await printAnalyzedStatements(analyzedFile)).toEqual(
                    new Set([
                        `while ((event.target as HTMLInputElement).value != 'ok') /*...*/ --> sandbox, patterns matched: []`,
                    ]),
                );
                expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([]));
            });
        });

        describe('analyze assignment patterns', () => {
            it('should support setting event.target.value to a constant', async () => {
                const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    (event.target as HTMLInputElement).value = '12';
                }`);
                const patterns = setEventTargetValuePattern();
                const bindingResolver = new SourceFileBindingResolver(sourceFile);

                const analyzedFile = new ScopedSourceFileStatementAnalyzer(
                    sourceFile,
                    bindingResolver,
                    patterns,
                    sourceFile.getChildren()[1]
                );

                expect(await printAnalyzedStatements(analyzedFile)).toEqual(
                    new Set([
                        `(event.target as HTMLInputElement).value = '12'; --> main, patterns matched: [0]`,
                    ]),
                );
                expect(await printAnalyzedExpressions(analyzedFile)).toEqual(
                    new Set([
                        '0: (event.target as HTMLInputElement).value; matches setEventTargetValue',
                    ]),
                );
            });
        });

        describe('analyze function calls', () => {
            it('should support call patterns', async () => {
                const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    event.preventDefault();
                }`);
                const patterns = eventPreventDefaultPattern();
                const bindingResolver = new SourceFileBindingResolver(sourceFile);

                const analyzedFile = new ScopedSourceFileStatementAnalyzer(
                    sourceFile,
                    bindingResolver,
                    patterns,
                    sourceFile.getChildren()[1]
                );

                expect(await printAnalyzedStatements(analyzedFile)).toEqual(
                    new Set(['event.preventDefault(); --> main, patterns matched: [0]']),
                );
                expect(await printAnalyzedExpressions(analyzedFile)).toEqual(
                    new Set(['0: event.preventDefault(); matches eventPreventDefault']),
                );
            });

            it('should support value replace on input', async () => {
                const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    event.target.value = event.target.value.replace(/[^A-Za-z0-9]+/g, '');
                }`);
                const patterns = [
                    ...setEventTargetValuePattern(),
                    ...readEventTargetValuePattern(),
                    ...stringReplacePattern(),
                ];
                const bindingResolver = new SourceFileBindingResolver(sourceFile);

                const analyzedFile = new ScopedSourceFileStatementAnalyzer(
                    sourceFile,
                    bindingResolver,
                    patterns,
                    sourceFile.getChildren()[1]
                );

                expect(await printAnalyzedStatements(analyzedFile)).toEqual(
                    new Set([
                        "event.target.value = event.target.value.replace(/[^A-Za-z0-9]+/g, ''); --> main, patterns matched: [0, 1]",
                    ]),
                );
                expect(await printAnalyzedExpressions(analyzedFile)).toEqual(
                    new Set([
                        "0: event.target.value.replace(/[^A-Za-z0-9]+/g, ''); matches inputValuePattern, stringReplace",
                        '1: event.target.value; matches setEventTargetValue',
                    ]),
                );
            });

            it('should support value replace on input with intermediate variables', async () => {
                const sourceFile = createTsSourceFile(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    const inputValue = event.target.value;
                    const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, '');
                    event.target.value = validValue;
                }`);
                const patterns = [
                    ...setEventTargetValuePattern(),
                    ...readEventTargetValuePattern(),
                    ...stringReplacePattern(),
                ];
                const bindingResolver = new SourceFileBindingResolver(sourceFile);

                const analyzedFile = new ScopedSourceFileStatementAnalyzer(
                    sourceFile,
                    bindingResolver,
                    patterns,
                    sourceFile.getChildren()[1]
                );

                expect(await printAnalyzedStatements(analyzedFile)).toEqual(
                    new Set([
                        'const inputValue = event.target.value; --> main, patterns matched: [0]',
                        "const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, ''); --> main, patterns matched: [1]",
                        'event.target.value = validValue; --> main, patterns matched: [2, 3]',
                    ]),
                );
                expect(await printAnalyzedExpressions(analyzedFile)).toEqual(
                    new Set([
                        '0: event.target.value; matches inputValuePattern',
                        "1: inputValue.replace(/[^A-Za-z0-9]+/g, ''); matches inputValuePattern, stringReplace",
                        '2: validValue; matches knownVariableReadPattern',
                        '3: event.target.value; matches setEventTargetValue',
                    ]),
                );
            });
        });
    });

    describe('exec$', () => {
        it('analyze exec$ single line arrow function', async () => {
            const sourceFile = createTsSourceFile(`
                import {exec$} from "jay-secure";
                export function bla() {
                    exec$(() => console.log('hi'));
                }`);
            const patterns = consoleLog();
            const bindingResolver = new SourceFileBindingResolver(sourceFile);

            const analyzedFile = new ScopedSourceFileStatementAnalyzer(
                sourceFile,
                bindingResolver,
                patterns,
                sourceFile.getChildren()[1]
            );

            expect(await printAnalyzedStatements(analyzedFile)).toEqual(
                new Set([
                    `exec$(() => console.log('hi')); --> sandbox, patterns matched: [0]`,
                ]),
            );
            expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([
                `0: console.log('hi'); matches consoleLog`
            ]));

        })

        it('analyze exec$ with console log varargs', async () => {
            const sourceFile = createTsSourceFile(`
                import {exec$} from "jay-secure";
                export function bla() {
                    exec$(() => console.log('hi', 'jay'));
                }`);
            const patterns = consoleLogVarargs();
            const bindingResolver = new SourceFileBindingResolver(sourceFile);

            const analyzedFile = new ScopedSourceFileStatementAnalyzer(
                sourceFile,
                bindingResolver,
                patterns,
                sourceFile.getChildren()[1]
            );

            expect(await printAnalyzedStatements(analyzedFile)).toEqual(
                new Set([
                    `exec$(() => console.log('hi', 'jay')); --> sandbox, patterns matched: [0]`,
                ]),
            );
            expect(await printAnalyzedExpressions(analyzedFile)).toEqual(new Set([
                `0: console.log('hi', 'jay'); matches consoleLog`
            ]));

        })
    })
});

async function printMatchedExpression(matchedExpression: MatchedPattern) {
    let printedExpression = (await astToFormattedCode(matchedExpression.expression)).trim();
    return `${matchedExpression.testId}: ${printedExpression} matches ${matchedExpression.patterns.map((_) => _.name).join(', ')}`;
}

async function printAnalyzedExpressions(analyzer: ScopedSourceFileStatementAnalyzer) {
    let printed = new Set<string>();
    for await (let expression of analyzer.getMatchedExpressions()) {
        let matchedPattern = analyzer.getExpressionStatus(expression);
        printed.add(await printMatchedExpression(matchedPattern));
    }
    return printed;
}

async function printAnalyzedStatements(analyzer: ScopedSourceFileStatementAnalyzer) {
    let printed = new Set<string>();
    for await (let statement of analyzer.getAnalyzedStatements()) {
        let analysisResult = analyzer.getStatementStatus(statement);
        let printedStatement = (await printStatementWithoutChildStatements(statement)).trim();
        let patternsMatched = analysisResult.matchedPatterns
            .map((_) => _.testId)
            .sort()
            .join(', ');
        printed.add(
            `${printedStatement} --> ${jayTargetEnvName(analysisResult.targetEnv)}, patterns matched: [${patternsMatched}]`,
        );
    }
    return printed;
}
