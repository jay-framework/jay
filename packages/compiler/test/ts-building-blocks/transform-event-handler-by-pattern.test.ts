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
import {
    eventPreventDefaultPattern,
    readEventTargetValuePattern, setEventTargetValuePattern,
    stringReplacePattern
} from "./compiler-patterns-for-testing.ts";
import {SourceFileBindingResolver} from "../../lib/ts-file/building-blocks/source-file-binding-resolver.ts";
import {SourceFileStatementDependencies} from "../../lib/ts-file/building-blocks/source-file-statement-dependencies.ts";
import {SourceFileStatementAnalyzer} from "../../lib/ts-file/building-blocks/source-file-statement-analyzer.ts";

describe('split event handler by pattern', () => {
    const READ_EVENT_TARGET_VALUE = readEventTargetValuePattern();
    const EVENT_PREVENT_DEFAULT = eventPreventDefaultPattern();

    function testTransformer(compiledPatterns: CompiledPattern[]) {
        let splitEventHandlers: TransformedEventHandlerByPattern[] = [];
        let transformer = mkTransformer(({ context, sourceFile, factory }) => {
            let bindingResolver = new SourceFileBindingResolver(sourceFile);
            let dependencies = new SourceFileStatementDependencies(sourceFile, bindingResolver);
            let analyzer = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, compiledPatterns);
            const visitor = (node) => {
                if (isFunctionDeclaration(node) || isArrowFunction(node)) {
                    let splitEventHandler = transformEventHandlerByPatternBlock(
                        context,
                        bindingResolver,
                        dependencies,
                        analyzer,
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
        it('should replace function call parameter for arrow event handler', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => setText((event.target as HTMLInputElement).value)`;
            const { transformer, splitEventHandlers } = testTransformer(READ_EVENT_TARGET_VALUE);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(await prettify(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => setText(event.$0)`));
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await prettify(splitEventHandlers[0].functionRepositoryFragment)).toEqual(
                await prettify(`({ event }: JayEvent) => ({$0: event.target.value})`),
            );
        });

        it('should replace function call parameter for function event handler', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                function bla({event}: JayEvent) { 
                    setText((event.target as HTMLInputElement).value) 
                }`;
            const { transformer, splitEventHandlers } = testTransformer(READ_EVENT_TARGET_VALUE);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import { JayEvent } from 'jay-runtime';
                function bla({ event }: JayEvent) {
                    setText(event.$0) 
                }`),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await prettify(splitEventHandlers[0].functionRepositoryFragment)).toEqual(
                await prettify(`({ event }: JayEvent) => ({$0: event.target.value})`),
            );
        });

        it.skip('should support variable', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                function bla({event}: JayEvent) {
                    let target = event.target as HTMLInputElement;  
                    setText(target.value) 
                }`;
            const { transformer, splitEventHandlers } = testTransformer(READ_EVENT_TARGET_VALUE);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                function bla({event}: JayEvent) {
                    let target = event.target as HTMLInputElement; ??? 
                    setText(event.$0) 
                }`),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await prettify(splitEventHandlers[0].functionRepositoryFragment)).toEqual(
                await prettify(`({ event }: JayEvent) => ({$0: event.target.value})`),
            );
        });

        it('should support variable 2', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                function bla({event}: JayEvent) {
                    let value = (event.target as HTMLInputElement).value;  
                    setText(value) 
                }`;
            const { transformer, splitEventHandlers } = testTransformer(READ_EVENT_TARGET_VALUE);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                function bla({event}: JayEvent) {
                    setText(event.$0);
                }`),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();

            // todo we can optimize out the variable declaration here.
            expect(await prettify(splitEventHandlers[0].functionRepositoryFragment)).toEqual(
                await prettify(`({ event }: JayEvent) => {
                    let value = (event.target as HTMLInputElement).value;
                    return { $0: event.target.value };
                };`),
            );
        });

        it('should not transform and not mark eventHandlerMatchedPatterns if no pattern is matched 1', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                function bla({event}: JayEvent) { 
                    setText((event.target as HTMLInputElement).keycode) 
                }`;
            const { transformer, splitEventHandlers } = testTransformer(READ_EVENT_TARGET_VALUE);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(
                    `import {JayEvent} from 'jay-runtime';
                    function bla({event}: JayEvent) { 
                        setText((event.target as HTMLInputElement).keycode) 
                    }`,
                ),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeFalsy();
            expect(splitEventHandlers[0].functionRepositoryFragment).not.toBeDefined();
        });

        it('should not transform and not mark eventHandlerMatchedPatterns if no pattern is matched 2', async () => {
            const inputEventHandler = `function bla({event}) { setCount(count() + 1) }`;
            const { transformer, splitEventHandlers } = testTransformer(READ_EVENT_TARGET_VALUE);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`function bla({event}) { setCount(count() + 1) }`),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeFalsy();
            expect(splitEventHandlers[0].functionRepositoryFragment).not.toBeDefined();
        });
    });

    describe('extract call pattern', () => {
        it('should extract event.preventDefault()', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    event.preventDefault();
                    console.log('mark');
                }`;
            const { transformer, splitEventHandlers } = testTransformer(EVENT_PREVENT_DEFAULT);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    console.log('mark');
                }`),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await prettify(splitEventHandlers[0].functionRepositoryFragment)).toEqual(
                await prettify(`({event}: JayEvent) => {
                    event.preventDefault();
                }`),
            );
        });
    });

    describe('extract assign pattern', () => {

        it('should support input validations using regex, single line', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    event.target.value = event.target.value.replace(/[^A-Za-z0-9]+/g, '');
                }`;
            const { transformer, splitEventHandlers } =
                testTransformer([...READ_EVENT_TARGET_VALUE, ...stringReplacePattern(), ...setEventTargetValuePattern()]);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(await prettify(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {}
                `));
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await prettify(splitEventHandlers[0].functionRepositoryFragment)).toEqual(
                await prettify(`
                ({ event }: JayEvent) => {
                    event.target.value = event.target.value.replace(/[^A-Za-z0-9]+/g, '');
                }`),
            );
        });

        it('should support input validations using regex with variable declaration', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    const inputValue = event.target.value;
                    const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, '');
                    event.target.value = validValue;
                }`;
            const { transformer, splitEventHandlers } =
                testTransformer([...READ_EVENT_TARGET_VALUE, ...stringReplacePattern(), ...setEventTargetValuePattern()]);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(await prettify(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {}
                `));
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await prettify(splitEventHandlers[0].functionRepositoryFragment)).toEqual(
                await prettify(`
                ({ event }: JayEvent) => {
                    const inputValue = event.target.value;
                    const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, '');
                    event.target.value = validValue;
                }`),
            );
        });
    })

    describe('combination of patterns', () => {
        it('should support both assign pattern and a read expression (pattern for set state)', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    const inputValue = event.target.value;
                    const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, '');
                    event.target.value = validValue;
                    setState(validValue);
                }`;
            const { transformer, splitEventHandlers } =
                testTransformer([...READ_EVENT_TARGET_VALUE, ...stringReplacePattern(), ...setEventTargetValuePattern()]);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(await prettify(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    setState(event.$0)
                }
                `));
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await prettify(splitEventHandlers[0].functionRepositoryFragment)).toEqual(
                await prettify(`
                ({ event }: JayEvent) => {
                    const inputValue = event.target.value;
                    const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, '');
                    event.target.value = validValue;
                    return {$0: validValue}
                }`),
            );
        });
    })
});
