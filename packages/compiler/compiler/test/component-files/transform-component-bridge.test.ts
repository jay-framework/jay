import { transformCode } from '../test-utils/ts-compiler-test-utils';
import { transformComponentBridge, RuntimeMode } from '../../lib';
import { prettify } from '../../lib';
import {
    eventPreventDefaultPattern,
    readEventKeyCodePattern,
    readEventTargetValuePattern,
} from './ts-basic-analyzers/compiler-patterns-for-testing';
import { FunctionRepositoryBuilder } from '../../lib';

function globalFunctionRepo(): FunctionRepositoryBuilder {
    return new FunctionRepositoryBuilder();
}

describe('transform component bridge', () => {
    describe('generate component bridge', () => {
        it('replace makeJayComponent with makeJayComponentBridge and remove all unneeded code', async () => {
            const code = `
                import { makeJayComponent, Props } from 'jay-component';
                import { CompElementRefs, render } from './generated-element';
                
                function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                    let x = 1;
                    for (let y = 0; y < 100; y++)
                        console.log(y + x); 
                }
                
                export const Comp = makeJayComponent(render, CompComponent);`;

            const outputCode = await transformCode(code, [
                transformComponentBridge(RuntimeMode.MainSandbox, [], globalFunctionRepo()),
            ]);

            expect(outputCode).toEqual(
                await prettify(`
                import { makeJayComponentBridge } from 'jay-secure';
                import { render } from './generated-element?jay-mainSandbox';
                export const Comp = makeJayComponentBridge(render);
                `),
            );
        });

        it('preserve css imports', async () => {
            const code = `
                import { makeJayComponent, Props } from 'jay-component';
                import { CompElementRefs, render } from './generated-element';
                import 'bla.css';
                
                function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                    let x = 1;
                    for (let y = 0; y < 100; y++)
                        console.log(y + x); 
                }
                
                export const Comp = makeJayComponent(render, CompComponent);`;

            const outputCode = await transformCode(code, [
                transformComponentBridge(RuntimeMode.MainSandbox, [], globalFunctionRepo()),
            ]);

            expect(outputCode).toEqual(
                await prettify(`
                import { makeJayComponentBridge } from 'jay-secure';
                import { render } from './generated-element?jay-mainSandbox';
                import 'bla.css';
                export const Comp = makeJayComponentBridge(render);
                `),
            );
        });
    });

    describe('generate function repository', () => {
        const input_value_pattern = readEventTargetValuePattern();
        describe('for return patterns', () => {
            it('create event.target.value in function repository', async () => {
                const code = `
                    import {JayEvent} from 'jay-runtime';
                    import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
                    import { CompElementRefs, render, ViewState } from './generated-element';
                    
                    function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                        let [text, setText] = createSignal('');
                        refs.input.onchange(({event}: JayEvent<Event, ViewState>) => setText((event.target as HTMLInputElement).value));
                    }
                    
                    export const Comp = makeJayComponent(render, CompComponent);`;

                const outputCode = await transformCode(code, [
                    transformComponentBridge(
                        RuntimeMode.MainSandbox,
                        input_value_pattern,
                        globalFunctionRepo(),
                    ),
                ]);

                expect(outputCode).toEqual(
                    await prettify(`
                    import {JayEvent} from 'jay-runtime';
                    import { makeJayComponentBridge, FunctionsRepository } from 'jay-secure';
                    import { render } from './generated-element?jay-mainSandbox';
                    const funcRepository: FunctionsRepository = {
                        '0': ({ event }: JayEvent<any, any>) => ({ $0: event.target.value }),
                    };
                    export const Comp = makeJayComponentBridge(render, { funcRepository });
                    `),
                );
            });

            it('replace event.target.value for two event handlers', async () => {
                const code = `
                    import {JayEvent} from 'jay-runtime';
                    import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
                    import { render } from './generated-element';
                    
                    function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                        let [text, setText] = createSignal('');
                        refs.input.onchange(({event}: JayEvent<Event, ViewState>) => setText((event.target as HTMLInputElement).value));
                        refs.input2.onchange(({event}: JayEvent<Event, ViewState>) => setText((event.target as HTMLInputElement).value));
                    }
                    
                    export const Comp = makeJayComponent(render, CompComponent);`;

                const outputCode = await transformCode(code, [
                    transformComponentBridge(
                        RuntimeMode.MainSandbox,
                        input_value_pattern,
                        globalFunctionRepo(),
                    ),
                ]);

                expect(outputCode).toEqual(
                    await prettify(`
                    import {JayEvent} from 'jay-runtime';
                    import { makeJayComponentBridge, FunctionsRepository } from 'jay-secure';
                    import { render } from './generated-element?jay-mainSandbox';
                    const funcRepository: FunctionsRepository = {
                        '0': ({ event }: JayEvent<any, any>) => ({ $0: event.target.value }),
                        '1': ({ event }: JayEvent<any, any>) => ({ $0: event.target.value })
                    };
                    export const Comp = makeJayComponentBridge(render, { funcRepository });
                    `),
                );
            });

            it('replace event.target.value for two event handler reusing the handler', async () => {
                const code = `
                    import {JayEvent} from 'jay-runtime';
                    import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
                    import { CompElementRefs, render, ViewState } from './generated-element';
                    
                    function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                        let [text, setText] = createSignal('');
                        function updateText({event}: JayEvent<Event, ViewState>) {
                            setText((event.target as HTMLInputElement).value);
                        }
                        refs.input.onchange(updateText);
                        refs.input2.onchange(updateText);
                    }
                    
                    export const Comp = makeJayComponent(render, CompComponent);`;

                const outputCode = await transformCode(code, [
                    transformComponentBridge(
                        RuntimeMode.MainSandbox,
                        input_value_pattern,
                        globalFunctionRepo(),
                    ),
                ]);

                expect(outputCode).toEqual(
                    await prettify(`
                    import {JayEvent} from 'jay-runtime';
                    import { makeJayComponentBridge, FunctionsRepository } from 'jay-secure';
                    import { render } from './generated-element?jay-mainSandbox';
                    const funcRepository: FunctionsRepository = {
                        '0': ({ event }: JayEvent<any, any>) => ({ $0: event.target.value }),
                    };
                    export const Comp = makeJayComponentBridge(render, { funcRepository });`),
                );
            });

            it('should not transform an event handler that does not match any pattern', async () => {
                const code = `
                    import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
                    import { CompElementRefs, render } from './generated-element';
                    
                    function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                        let [count, setCount] = createSignal('');
                        refs.input.onchange(() => setCount(count()+1));
                    }
                    
                    export const Comp = makeJayComponent(render, CompComponent);`;

                const outputCode = await transformCode(code, [
                    transformComponentBridge(
                        RuntimeMode.MainSandbox,
                        input_value_pattern,
                        globalFunctionRepo(),
                    ),
                ]);

                expect(outputCode).toEqual(
                    await prettify(`
                    import { makeJayComponentBridge } from 'jay-secure';
                    import { render } from './generated-element?jay-mainSandbox';
                    export const Comp = makeJayComponentBridge(render);`),
                );
            });
        });

        describe('for call patterns', () => {
            const preventDefaultPattern = eventPreventDefaultPattern();

            it('extract event.preventDefault()', async () => {
                const code = `
                    import {JayEvent} from 'jay-runtime';
                    import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
                    import { CompElementRefs, render, ViewState } from './generated-element';
                    
                    function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                        let [text, setText] = createSignal('');
                        refs.input.onchange(({event}: JayEvent<Event, ViewState>) => {
                            event.preventDefault();
                            setText((event.target as HTMLInputElement).value)
                        });
                    }
                    
                    export const Comp = makeJayComponent(render, CompComponent);`;

                const outputCode = await transformCode(code, [
                    transformComponentBridge(
                        RuntimeMode.MainSandbox,
                        preventDefaultPattern,
                        globalFunctionRepo(),
                    ),
                ]);

                expect(outputCode).toEqual(
                    await prettify(`
                    import {JayEvent} from 'jay-runtime';
                    import { makeJayComponentBridge, FunctionsRepository } from 'jay-secure';
                    import { render } from './generated-element?jay-mainSandbox';
                    const funcRepository: FunctionsRepository = {
                        '0': ({ event }: JayEvent<any, any>) => {
                            event.preventDefault();
                        },
                    };
                    export const Comp = makeJayComponentBridge(render, { funcRepository });
                    `),
                );
            });
        });

        describe('for constants', () => {
            const patterns = [...eventPreventDefaultPattern(), ...readEventKeyCodePattern()];

            it('create constant in functions repository', async () => {
                const code = `
                    import {JayEvent} from 'jay-runtime';
                    import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
                    import { CompElementRefs, render, ViewState } from './generated-element';
                    
                    const KEY_CODE = 13;
                    
                    function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                        let [text, setText] = createSignal('');
                        refs.input.onchange(({event}: JayEvent<Event, ViewState>) => {
                            if (event.keyCode === KEY_CODE) {
                                event.preventDefault();
                                setText((event.target as HTMLInputElement).value)
                            }
                        });
                    }
                    
                    export const Comp = makeJayComponent(render, CompComponent);`;

                const outputCode = await transformCode(code, [
                    transformComponentBridge(
                        RuntimeMode.MainSandbox,
                        patterns,
                        globalFunctionRepo(),
                    ),
                ]);

                expect(outputCode).toEqual(
                    await prettify(`
                    import {JayEvent} from 'jay-runtime';
                    import { makeJayComponentBridge, FunctionsRepository } from 'jay-secure';
                    import { render } from './generated-element?jay-mainSandbox';
                    const KEY_CODE = 13;
                    const funcRepository: FunctionsRepository = {
                        '0': ({ event }: JayEvent<any, any>) => {
                            if (event.keyCode === KEY_CODE) {
                                event.preventDefault();
                            }
                            return { $0: event.keyCode };
                        },
                    };
                    export const Comp = makeJayComponentBridge(render, { funcRepository });
                    `),
                );
            });
        });
    });
});
