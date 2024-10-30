import { CompiledPattern } from '../../lib';
import { mkTransformer } from '../../lib/ts-file/ts-utils/mk-transformer';
import {
    TransformedEventHandlerByPattern,
    analyzeEventHandlerByPatternBlock,
} from '../../lib/ts-file/building-blocks/analyze-event-handler-by-pattern';
import { transformCode } from '../test-utils/ts-compiler-test-utils';
import ts, { isArrowFunction, isFunctionDeclaration } from 'typescript';
import { prettify } from '../../lib';
import {
    eventPreventDefaultPattern,
    readEventKeyCodePattern,
    readEventTargetValuePattern,
    setEventTargetValuePattern,
    stringReplacePattern,
} from '../ts-basic-analyzers/compiler-patterns-for-testing';
import { SourceFileBindingResolver } from '../../lib/ts-file/basic-analyzers/source-file-binding-resolver';
import {
    SourceFileStatementAnalyzer
} from '../../lib/ts-file/basic-analyzers/scoped-source-file-statement-analyzer';

describe('split event handler by pattern', () => {
    const READ_EVENT_TARGET_VALUE = readEventTargetValuePattern();
    const EVENT_PREVENT_DEFAULT = eventPreventDefaultPattern();

    function testTransformer(compiledPatterns: CompiledPattern[]) {
        let splitEventHandlers: TransformedEventHandlerByPattern[] = [];
        let transformer = mkTransformer(({ context, sourceFile, factory }) => {
            let bindingResolver = new SourceFileBindingResolver(sourceFile);
            const visitor = (node) => {
                let analyzer = new SourceFileStatementAnalyzer(
                    sourceFile,
                    bindingResolver,
                    compiledPatterns
                );
                if (isFunctionDeclaration(node) || isArrowFunction(node)) {
                    let splitEventHandler = analyzeEventHandlerByPatternBlock(
                        context,
                        bindingResolver,
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

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => setText(event.$0)`),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(
                await prettify(splitEventHandlers[0].functionRepositoryFragment.handlerCode),
            ).toEqual(await prettify(`({ event }: JayEvent) => ({$0: event.target.value})`));
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
            expect(
                await prettify(splitEventHandlers[0].functionRepositoryFragment.handlerCode),
            ).toEqual(await prettify(`({ event }: JayEvent) => ({$0: event.target.value})`));
        });

        it('should not support partial pattern matching assignment, which creates invalid code', async () => {
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
                    let target = event.target as HTMLInputElement; 
                    setText(event.$0) 
                }`),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(
                await prettify(splitEventHandlers[0].functionRepositoryFragment.handlerCode),
            ).toEqual(await prettify(`({ event }: JayEvent) => ({$0: event.target.value})`));
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
            expect(
                await prettify(splitEventHandlers[0].functionRepositoryFragment.handlerCode),
            ).toEqual(
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
            expect(
                await prettify(splitEventHandlers[0].functionRepositoryFragment.handlerCode),
            ).toEqual(
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
            const { transformer, splitEventHandlers } = testTransformer([
                ...READ_EVENT_TARGET_VALUE,
                ...stringReplacePattern(),
                ...setEventTargetValuePattern(),
            ]);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {}
                `),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(
                await prettify(splitEventHandlers[0].functionRepositoryFragment.handlerCode),
            ).toEqual(
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
            const { transformer, splitEventHandlers } = testTransformer([
                ...READ_EVENT_TARGET_VALUE,
                ...stringReplacePattern(),
                ...setEventTargetValuePattern(),
            ]);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {}
                `),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(
                await prettify(splitEventHandlers[0].functionRepositoryFragment.handlerCode),
            ).toEqual(
                await prettify(`
                ({ event }: JayEvent) => {
                    const inputValue = event.target.value;
                    const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, '');
                    event.target.value = validValue;
                }`),
            );
        });
    });

    describe('compound event handlers', () => {
        it('should support both assign pattern and a read expression (pattern for set state)', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    const inputValue = event.target.value;
                    const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, '');
                    event.target.value = validValue;
                    setState(validValue);
                }`;
            const { transformer, splitEventHandlers } = testTransformer([
                ...READ_EVENT_TARGET_VALUE,
                ...stringReplacePattern(),
                ...setEventTargetValuePattern(),
            ]);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    setState(event.$0)
                }
                `),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(
                await prettify(splitEventHandlers[0].functionRepositoryFragment.handlerCode),
            ).toEqual(
                await prettify(`
                ({ event }: JayEvent) => {
                    const inputValue = event.target.value;
                    const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, '');
                    event.target.value = validValue;
                    return {$0: validValue}
                }`),
            );
        });

        it('should support reading the same value multiple times, with one function repository variable', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    setState1(event.target.value);
                    setState2(event.target.value);
                }`;
            const { transformer, splitEventHandlers } = testTransformer([
                ...READ_EVENT_TARGET_VALUE,
                ...stringReplacePattern(),
                ...setEventTargetValuePattern(),
            ]);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    setState1(event.$0);
                    setState2(event.$0);
                }
                `),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(
                await prettify(splitEventHandlers[0].functionRepositoryFragment.handlerCode),
            ).toEqual(
                await prettify(`
                ({ event }: JayEvent) => ({ $0: event.target.value });`),
            );
        });

        it('support if statement', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    if (event.keyCode === 20) {
                        event.preventDefault();
                        let newValue = newTodo();
                        let val = newValue.trim();
                        setNewTodo('');
                    }
                }`;
            const { transformer, splitEventHandlers } = testTransformer([
                ...readEventKeyCodePattern(),
                ...eventPreventDefaultPattern(),
            ]);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                ({event}: JayEvent) => {
                    if (event.$0 === 20) {
                        let newValue = newTodo();
                        let val = newValue.trim();
                        setNewTodo('');
                    }
                }
                `),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(
                await prettify(splitEventHandlers[0].functionRepositoryFragment.handlerCode),
            ).toEqual(
                await prettify(`
                ({ event }: JayEvent) => {
                    if (event.keyCode === 20) {
                        event.preventDefault();
                    }  
                    return { $0: event.keyCode };  
                }`),
            );
        });

        it('should support if statement with constant', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                const ENTER_KEY = 13;
                ({event}: JayEvent) => {
                    if (event.keyCode === ENTER_KEY) {
                        event.preventDefault();
                        let newValue = newTodo();
                        let val = newValue.trim();
                        setNewTodo('');
                    }
                }`;
            const { transformer, splitEventHandlers } = testTransformer([
                ...readEventKeyCodePattern(),
                ...eventPreventDefaultPattern(),
            ]);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                const ENTER_KEY = 13;
                ({event}: JayEvent) => {
                    if (event.$0 === ENTER_KEY) {
                        let newValue = newTodo();
                        let val = newValue.trim();
                        setNewTodo('');
                    }
                }
                `),
            );
            expect(splitEventHandlers[0].wasEventHandlerTransformed).toBeTruthy();
            expect(
                await prettify(splitEventHandlers[0].functionRepositoryFragment.handlerCode),
            ).toEqual(
                await prettify(`
                ({ event }: JayEvent) => {
                    if (event.keyCode === ENTER_KEY) {
                        event.preventDefault();
                    }  
                    return { $0: event.keyCode };  
                }`),
            );
            expect(
                await prettify(splitEventHandlers[0].functionRepositoryFragment.constCode),
            ).toEqual(
                await prettify(`
                const ENTER_KEY = 13;`),
            );
        });

        it('should not support if statement with non constant variable', async () => {
            const inputEventHandler = `
                import {JayEvent} from 'jay-runtime';
                let ENTER_KEY = 13;
                ({event}: JayEvent) => {
                    if (event.keyCode === ENTER_KEY) {
                        event.preventDefault();
                        let newValue = newTodo();
                        let val = newValue.trim();
                        setNewTodo('');
                    }
                }`;
            const { transformer, splitEventHandlers } = testTransformer([
                ...readEventKeyCodePattern(),
                ...eventPreventDefaultPattern(),
            ]);
            let transformed = await transformCode(inputEventHandler, [transformer]);

            expect(transformed).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                let ENTER_KEY = 13;
                ({event}: JayEvent) => {
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
            expect(
                await prettify(splitEventHandlers[0].functionRepositoryFragment.handlerCode),
            ).toEqual(
                await prettify(`
                ({ event }: JayEvent) => ({ $0: event.keyCode });`),
            );
        });
    });
});
