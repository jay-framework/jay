import { transformCode } from './test-utils/ts-compiler-test-utils';
import { transformComponent } from '../lib';
import { prettify } from '../lib';
import {
    eventPreventDefaultPattern,
    readEventTargetValuePattern,
} from './ts-basic-analyzers/compiler-patterns-for-testing';
import { FunctionRepositoryBuilder } from '../lib';

function globalFunctionRepo(): FunctionRepositoryBuilder {
    return new FunctionRepositoryBuilder();
}

describe('transform event handlers with secure code split', () => {
    describe('remove main scope imports', () => {
        it('remove css import', async () => {
            const code = `
                import {JayEvent} from 'jay-runtime';
                import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
                import { CompElementRefs, render } from './generated-element';
                import 'bla.css';
                
                function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                    let [text, setText] = createSignal('');
                    refs.input.onchange(({event}: JayEvent) => setText('hi'));
                }
                
                export const Comp = makeJayComponent(render, CompComponent);`;

            const outputCode = await transformCode(code, [
                transformComponent([], globalFunctionRepo()),
            ]);

            expect(outputCode).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
                import { CompElementRefs, render } from './generated-element?jay-workerSandbox';
                function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                    let [text, setText] = createSignal('');
                    refs.input.onchange(({event}: JayEvent) => setText('hi'));
                }
                export const Comp = makeJayComponent(render, CompComponent);`),
            );
        });
    });

    describe('transform return value pattern', () => {
        const input_value_pattern = readEventTargetValuePattern();
        it('replace event.target.value for a single event handler', async () => {
            const code = `
                import {JayEvent} from 'jay-runtime';
                import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
                import { CompElementRefs, render } from './generated-element';
                
                function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                    let [text, setText] = createSignal('');
                    refs.input.onchange(({event}: JayEvent<Event, ViewState>) => setText((event.target as HTMLInputElement).value));
                }
                
                export const Comp = makeJayComponent(render, CompComponent);`;

            const outputCode = await transformCode(code, [
                transformComponent(input_value_pattern, globalFunctionRepo()),
            ]);

            expect(outputCode).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
                import { CompElementRefs, render } from './generated-element?jay-workerSandbox';
                import { handler$} from 'jay-secure';
                function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                    let [text, setText] = createSignal('');
                    refs.input
                        .onchange$(handler$('0'))
                        .then(({event}: JayEvent<any, ViewState>) => setText(event.$0));
                }
                export const Comp = makeJayComponent(render, CompComponent);`),
            );
        });

        it('replace event.target.value for two event handlers', async () => {
            const code = `
                import {JayEvent} from 'jay-runtime';
                import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
                import { CompElementRefs, render } from './generated-element';
                
                function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                    let [text, setText] = createSignal('');
                    refs.input.onchange(({event}: JayEvent<Event, ViewState>) => setText((event.target as HTMLInputElement).value));
                    refs.input2.onchange(({event}: JayEvent<Event, ViewState>) => setText((event.target as HTMLInputElement).value));
                }
                
                export const Comp = makeJayComponent(render, CompComponent);`;

            const outputCode = await transformCode(code, [
                transformComponent(input_value_pattern, globalFunctionRepo()),
            ]);

            expect(outputCode).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
                import { CompElementRefs, render } from './generated-element?jay-workerSandbox';
                import { handler$} from 'jay-secure';
                function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                    let [text, setText] = createSignal('');
                    refs.input
                        .onchange$(handler$('0'))
                        .then(({event}: JayEvent<any, ViewState>) => setText(event.$0));
                    refs.input2
                        .onchange$(handler$('1'))
                        .then(({event}: JayEvent<any, ViewState>) => setText(event.$0));
                }
                export const Comp = makeJayComponent(render, CompComponent);`),
            );
        });

        it('replace event.target.value for two event handler reusing the handler', async () => {
            const code = `
                import {JayEvent} from 'jay-runtime';
                import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
                import { CompElementRefs, render } from './generated-element';
                
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
                transformComponent(input_value_pattern, globalFunctionRepo()),
            ]);

            expect(outputCode).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
                import { CompElementRefs, render } from './generated-element?jay-workerSandbox';
                import { handler$} from 'jay-secure';
                function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                    let [text, setText] = createSignal('');
                    function updateText({event}: JayEvent<any, ViewState>) {
                        setText(event.$0);
                    }
                    refs.input
                        .onchange$(handler$('0'))
                        .then(updateText);
                    refs.input2
                        .onchange$(handler$('0'))
                        .then(updateText);
                }
                export const Comp = makeJayComponent(render, CompComponent);`),
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
                transformComponent(input_value_pattern, globalFunctionRepo()),
            ]);

            expect(outputCode).toEqual(
                await prettify(`
                import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
                import { CompElementRefs, render } from './generated-element?jay-workerSandbox';
                function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                    let [count, setCount] = createSignal('');
                    refs.input.onchange(() => setCount(count()+1));
                }
                export const Comp = makeJayComponent(render, CompComponent);`),
            );
        });
    });

    describe('transform call pattern', () => {
        const preventDefaultPattern = eventPreventDefaultPattern();

        it('extract event.preventDefault()', async () => {
            const code = `
                import {JayEvent} from 'jay-runtime';
                import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
                import { CompElementRefs, render } from './generated-element';
                
                function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                    let [text, setText] = createSignal('');
                    refs.input.onchange(({event}: JayEvent<Event, ViewState>) => {
                        event.preventDefault();
                        setText((event.target as HTMLInputElement).value)
                    });
                }
                
                export const Comp = makeJayComponent(render, CompComponent);`;

            const outputCode = await transformCode(code, [
                transformComponent(preventDefaultPattern, globalFunctionRepo()),
            ]);

            expect(outputCode).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
                import { CompElementRefs, render } from './generated-element?jay-workerSandbox';
                import { handler$} from 'jay-secure';
                function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                    let [text, setText] = createSignal('');
                    refs.input
                        .onchange$(handler$('0'))
                        .then(({event}: JayEvent<any, ViewState>) => {
                        setText((event.target as HTMLInputElement).value)
                    });
                }
                export const Comp = makeJayComponent(render, CompComponent);`),
            );
        });

        it('extract event.preventDefault()', async () => {
            const code = `
                import {JayEvent} from 'jay-runtime';
                import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
                import { CompElementRefs, render } from './generated-element';
                
                function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                    let [text, setText] = createSignal('');
                    refs.input.onchange(({event}: JayEvent<Event, ViewState>) => {
                        event.preventDefault();
                        setText((event.target as HTMLInputElement).value)
                    });
                }
                
                export const Comp = makeJayComponent(render, CompComponent);`;

            const outputCode = await transformCode(code, [
                transformComponent(preventDefaultPattern, globalFunctionRepo()),
            ]);

            expect(outputCode).toEqual(
                await prettify(`
                import {JayEvent} from 'jay-runtime';
                import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
                import { CompElementRefs, render } from './generated-element?jay-workerSandbox';
                import { handler$} from 'jay-secure';
                function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
                    let [text, setText] = createSignal('');
                    refs.input
                        .onchange$(handler$('0'))
                        .then(({event}: JayEvent<any, ViewState>) => {
                        setText((event.target as HTMLInputElement).value)
                    });
                }
                export const Comp = makeJayComponent(render, CompComponent);`),
            );
        });
    });
});
