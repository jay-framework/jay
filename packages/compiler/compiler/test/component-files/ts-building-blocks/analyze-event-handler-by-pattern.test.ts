import { CompiledPattern } from '../../../lib';
import { mkTransformer } from '../../../lib/components-files/ts-utils/mk-transformer';
import {
    TransformedEventHandlerByPattern,
    analyzeEventHandlerByPatternBlock,
} from '../../../lib/components-files/building-blocks/analyze-event-handler-by-pattern';
import { transformCode } from '../../test-utils/ts-compiler-test-utils';
import ts, { isArrowFunction, isFunctionDeclaration } from 'typescript';
import {
    eventPreventDefaultPattern,
    readEventKeyCodePattern,
    readEventTargetSelectedIndexPattern,
    readEventTargetValuePattern,
    setEventTargetValuePattern,
    stringReplacePattern,
} from '../ts-basic-analyzers/compiler-patterns-for-testing';
import { SourceFileBindingResolver } from '../../../lib/components-files/basic-analyzers/source-file-binding-resolver';
import { SourceFileStatementAnalyzer } from '../../../lib/components-files/basic-analyzers/scoped-source-file-statement-analyzer';
import { FunctionRepositoryBuilder } from '../../../lib';
import { prettify } from 'jay-compiler-shared';

describe('split event handler by pattern', () => {
    const READ_EVENT_TARGET_VALUE = readEventTargetValuePattern();
    const READ_EVENT_TARGET_SELECTED_INDEX = readEventTargetSelectedIndexPattern();
    const EVENT_PREVENT_DEFAULT = eventPreventDefaultPattern();

    function testTransformer(compiledPatterns: CompiledPattern[]) {
        let splitEventHandlers: TransformedEventHandlerByPattern[] = [];
        let functionsRepository = new FunctionRepositoryBuilder();
        let transformer = mkTransformer(({ context, sourceFile, factory }) => {
            let bindingResolver = new SourceFileBindingResolver(sourceFile);
            const visitor = (node) => {
                let analyzer = new SourceFileStatementAnalyzer(
                    sourceFile,
                    bindingResolver,
                    compiledPatterns,
                );
                if (isFunctionDeclaration(node) || isArrowFunction(node)) {
                    let splitEventHandler = analyzeEventHandlerByPatternBlock(
                        context,
                        bindingResolver,
                        analyzer,
                        factory,
                        node,
                        functionsRepository,
                    );
                    splitEventHandlers.push(splitEventHandler);
                    return splitEventHandler.transformedEventHandler;
                }
                return ts.visitEachChild(node, visitor, context);
            };
            return ts.visitEachChild(sourceFile, visitor, context);
        });
        return { transformer, splitEventHandlers, functionsRepository };
    }

    describe('replace return pattern with identifier', () => {
        it('should replace function call parameter for arrow event handler', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent<Event, ViewState>) => setText((event.target as HTMLInputElement).value)`;
            const { transformer, splitEventHandlers, functionsRepository } =
                testTransformer(READ_EVENT_TARGET_VALUE);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent<any, ViewState>) => setText(event.$0)`),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await printFragments(functionsRepository)).toEqual([
                await prettify(`({ event }: JayEvent<any, any>) => ({$0: event.target.value})`),
            ]);
        });

        it('should replace function call parameter for function event handler', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                function bla({event}: JayEvent<Event, ViewState>) { 
                    setText((event.target as HTMLInputElement).value) 
                }`;
            const { transformer, splitEventHandlers, functionsRepository } =
                testTransformer(READ_EVENT_TARGET_VALUE);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import { JayEvent } from 'jay-runtime';
                function bla({ event }: JayEvent<any, ViewState>) {
                    setText(event.$0) 
                }`),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await printFragments(functionsRepository)).toEqual([
                await prettify(`({ event }: JayEvent<any, any>) => ({$0: event.target.value})`),
            ]);
        });

        it('should not support partial pattern matching assignment, which creates invalid code', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                function bla({event}: JayEvent<Event, ViewState>) {
                    let target = event.target as HTMLInputElement;  
                    setText(target.value) 
                }`;
            const { transformer, splitEventHandlers, functionsRepository } =
                testTransformer(READ_EVENT_TARGET_VALUE);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                function bla({event}: JayEvent<any, ViewState>) {
                    let target = event.target as HTMLInputElement; 
                    setText(event.$0) 
                }`),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await printFragments(functionsRepository)).toEqual([
                await prettify(`({ event }: JayEvent<any, any>) => ({$0: event.target.value})`),
            ]);
        });

        it('should support variable 2', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                function bla({event}: JayEvent<Event, ViewState>) {
                    let value = (event.target as HTMLInputElement).value;  
                    setText(value) 
                }`;
            const { transformer, splitEventHandlers, functionsRepository } =
                testTransformer(READ_EVENT_TARGET_VALUE);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                function bla({event}: JayEvent<any, ViewState>) {
                    setText(event.$0);
                }`),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();

            // todo we can optimize out the variable declaration here.
            expect(await printFragments(functionsRepository)).toEqual([
                await prettify(`({ event }: JayEvent<any, any>) => {
                    let value = (event.target as HTMLInputElement).value;
                    return { $0: event.target.value };
                };`),
            ]);
        });

        it('should support variable 3', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                function bla({event}: JayEvent<Event, ViewState>) {
                    const index = (event.target as HTMLSelectElement).selectedIndex
                    setSelectedExample(Number(examples[index].value))
                }`;
            const { transformer, splitEventHandlers, functionsRepository } = testTransformer(
                READ_EVENT_TARGET_SELECTED_INDEX,
            );
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                function bla({event}: JayEvent<any, ViewState>) {
                    setSelectedExample(Number(examples[event.$0].value));
                }`),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();

            // todo we can optimize out the variable declaration here.
            expect(await printFragments(functionsRepository)).toEqual([
                await prettify(`({ event }: JayEvent<any, any>) => {
                    const index = (event.target as HTMLSelectElement).selectedIndex;
                    return { $0: event.target.selectedIndex };
                };`),
            ]);
        });

        it('should not transform and not mark eventHandlerMatchedPatterns if no pattern is matched 1', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                function bla({event}: JayEvent) { 
                    setText((event.target as HTMLInputElement).keycode) 
                }`;
            const { transformer, splitEventHandlers, functionsRepository } =
                testTransformer(READ_EVENT_TARGET_VALUE);
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
            expect(functionsRepository.fragments.length).toEqual(0);
        });

        it('should not transform and not mark eventHandlerMatchedPatterns if no pattern is matched 2', async () => {
            const inputEventHandler = `function bla({event}) { setCount(count() + 1) }`;
            const { transformer, splitEventHandlers, functionsRepository } =
                testTransformer(READ_EVENT_TARGET_VALUE);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`function bla({event}) { setCount(count() + 1) }`),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeFalsy();
            expect(functionsRepository.fragments.length).toEqual(0);
        });
    });

    describe('extract call pattern', () => {
        it('should extract event.preventDefault()', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent<Event, ViewState>) => {
                    event.preventDefault();
                    console.log('mark');
                }`;
            const { transformer, splitEventHandlers, functionsRepository } =
                testTransformer(EVENT_PREVENT_DEFAULT);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent<any, ViewState>) => {
                    console.log('mark');
                }`),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await printFragments(functionsRepository)).toEqual([
                await prettify(`({event}: JayEvent<any, any>) => {
                    event.preventDefault();
                }`),
            ]);
        });
    });

    describe('extract assign pattern', () => {
        it('should support input validations using regex, single line', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent<Event, ViewState>) => {
                    event.target.value = event.target.value.replace(/[^A-Za-z0-9]+/g, '');
                }`;
            const { transformer, splitEventHandlers, functionsRepository } = testTransformer([
                ...READ_EVENT_TARGET_VALUE,
                ...stringReplacePattern(),
                ...setEventTargetValuePattern(),
            ]);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent<any, ViewState>) => {}
                `),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await printFragments(functionsRepository)).toEqual([
                await prettify(`
                ({ event }: JayEvent<any, any>) => {
                    event.target.value = event.target.value.replace(/[^A-Za-z0-9]+/g, '');
                }`),
            ]);
        });

        it('should support input validations using regex with variable declaration', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent<Event, ViewState>) => {
                    const inputValue = event.target.value;
                    const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, '');
                    event.target.value = validValue;
                }`;
            const { transformer, splitEventHandlers, functionsRepository } = testTransformer([
                ...READ_EVENT_TARGET_VALUE,
                ...stringReplacePattern(),
                ...setEventTargetValuePattern(),
            ]);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent<any, ViewState>) => {}
                `),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await printFragments(functionsRepository)).toEqual([
                await prettify(`
                ({ event }: JayEvent<any, any>) => {
                    const inputValue = event.target.value;
                    const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, '');
                    event.target.value = validValue;
                }`),
            ]);
        });
    });

    describe('compound event handlers', () => {
        it('should support both assign pattern and a read expression (pattern for set state)', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent<Event, ViewState>) => {
                    const inputValue = event.target.value;
                    const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, '');
                    event.target.value = validValue;
                    setState(validValue);
                }`;
            const { transformer, splitEventHandlers, functionsRepository } = testTransformer([
                ...READ_EVENT_TARGET_VALUE,
                ...stringReplacePattern(),
                ...setEventTargetValuePattern(),
            ]);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent<any, ViewState>) => {
                    setState(event.$0)
                }
                `),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await printFragments(functionsRepository)).toEqual([
                await prettify(`
                ({ event }: JayEvent<any, any>) => {
                    const inputValue = event.target.value;
                    const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, '');
                    event.target.value = validValue;
                    return {$0: validValue}
                }`),
            ]);
        });

        it('should support reading the same value multiple times, with one function repository variable', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent<Event, ViewState>) => {
                    setState1(event.target.value);
                    setState2(event.target.value);
                }`;
            const { transformer, splitEventHandlers, functionsRepository } = testTransformer([
                ...READ_EVENT_TARGET_VALUE,
                ...stringReplacePattern(),
                ...setEventTargetValuePattern(),
            ]);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent<any, ViewState>) => {
                    setState1(event.$0);
                    setState2(event.$0);
                }
                `),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await printFragments(functionsRepository)).toEqual([
                await prettify(`
                ({ event }: JayEvent<any, any>) => ({ $0: event.target.value });`),
            ]);
        });

        it('support if statement', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent<Event, ViewState>) => {
                    if (event.keyCode === 20) {
                        event.preventDefault();
                        let newValue = newTodo();
                        let val = newValue.trim();
                        setNewTodo('');
                    }
                }`;
            const { transformer, splitEventHandlers, functionsRepository } = testTransformer([
                ...readEventKeyCodePattern(),
                ...eventPreventDefaultPattern(),
            ]);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent<any, ViewState>) => {
                    if (event.$0 === 20) {
                        let newValue = newTodo();
                        let val = newValue.trim();
                        setNewTodo('');
                    }
                }
                `),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await printFragments(functionsRepository)).toEqual([
                await prettify(`
                ({ event }: JayEvent<any, any>) => {
                    if (event.keyCode === 20) {
                        event.preventDefault();
                    }  
                    return { $0: event.keyCode };  
                }`),
            ]);
        });

        it('should support if statement with constant', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                const ENTER_KEY = 13;
                ({event}: JayEvent<Event, ViewState>) => {
                    if (event.keyCode === ENTER_KEY) {
                        event.preventDefault();
                        let newValue = newTodo();
                        let val = newValue.trim();
                        setNewTodo('');
                    }
                }`;
            const { transformer, splitEventHandlers, functionsRepository } = testTransformer([
                ...readEventKeyCodePattern(),
                ...eventPreventDefaultPattern(),
            ]);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                const ENTER_KEY = 13;
                ({event}: JayEvent<any, ViewState>) => {
                    if (event.$0 === ENTER_KEY) {
                        let newValue = newTodo();
                        let val = newValue.trim();
                        setNewTodo('');
                    }
                }
                `),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await printFragments(functionsRepository)).toEqual([
                await prettify(`
                ({ event }: JayEvent<any, any>) => {
                    if (event.keyCode === ENTER_KEY) {
                        event.preventDefault();
                    }  
                    return { $0: event.keyCode };  
                }`),
            ]);
            expect(await printConstants(functionsRepository)).toEqual([
                await prettify(`
                const ENTER_KEY = 13;`),
            ]);
        });

        it('should not support if statement with non constant variable', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                let ENTER_KEY = 13;
                ({event}: JayEvent<Event, ViewState>) => {
                    if (event.keyCode === ENTER_KEY) {
                        event.preventDefault();
                        let newValue = newTodo();
                        let val = newValue.trim();
                        setNewTodo('');
                    }
                }`;
            const { transformer, splitEventHandlers, functionsRepository } = testTransformer([
                ...readEventKeyCodePattern(),
                ...eventPreventDefaultPattern(),
            ]);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                let ENTER_KEY = 13;
                ({event}: JayEvent<any, ViewState>) => {
                    if (event.$0 === ENTER_KEY) {
                        event.preventDefault();
                        let newValue = newTodo();
                        let val = newValue.trim();
                        setNewTodo('');
                    }
                }
                `),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(await printFragments(functionsRepository)).toEqual([
                await prettify(`
                ({ event }: JayEvent<any, any>) => ({ $0: event.keyCode });`),
            ]);
        });
    });
});

async function printFragments(functionRepository: FunctionRepositoryBuilder) {
    let result = [];
    for await (let fragment of functionRepository.fragments) {
        const handler = await prettify(fragment.handlerCode);
        result.push(handler);
    }

    return result;
}

async function printConstants(functionRepository: FunctionRepositoryBuilder) {
    let result = [];
    for await (let constant of functionRepository.consts)
        result.push(`${await prettify(constant)}`);
    return result;
}
