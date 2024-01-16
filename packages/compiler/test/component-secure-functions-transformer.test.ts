import { transformCode } from './test-utils/ts-compiler-test-utils';
import { componentSecureFunctionsTransformer } from '../lib';
import { prettify } from '../lib';
import { compileFunctionSplitPatternsBlock } from '../lib/ts-file/building-blocks/compile-function-split-patterns';

describe('transform event handlers with secure code split', () => {
    const input_value_pattern = compileFunctionSplitPatternsBlock([
        `
function inputValuePattern({event}: JayEvent<any, any>) {
    return event.target.value;
}`,
    ]).val;

    describe('transform return value pattern', () => {
        it('replace event.target.value for a single event handler', async () => {
            const code = `
import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
import { CompElementRefs, render } from './generated-element';

function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
    let [text, setText] = createState('');
    refs.input.onchange(({event}) => setText((event.target as HTMLInputElement).value));
}

export const Comp = makeJayComponent(render, CompComponent);`;

            const outputCode = await transformCode(code, [
                componentSecureFunctionsTransformer(input_value_pattern),
            ]);

            expect(outputCode).toEqual(
                await prettify(`
import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
import { CompElementRefs, render } from './generated-element?jay-workerSandbox';
import { handler$} from 'jay-secure';
function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
    let [text, setText] = createState('');
    refs.input
        .onchange$(handler$('0'))
        .then(({event}) => setText(event.$0));
}
export const Comp = makeJayComponent(render, CompComponent);`),
            );
        });

        it('replace event.target.value for two event handlers', async () => {
            const code = `
import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
import { CompElementRefs, render } from './generated-element';

function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
    let [text, setText] = createState('');
    refs.input.onchange(({event}) => setText((event.target as HTMLInputElement).value));
    refs.input2.onchange(({event}) => setText((event.target as HTMLInputElement).value));
}

export const Comp = makeJayComponent(render, CompComponent);`;

            const outputCode = await transformCode(code, [
                componentSecureFunctionsTransformer(input_value_pattern),
            ]);

            expect(outputCode).toEqual(
                await prettify(`
import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
import { CompElementRefs, render } from './generated-element?jay-workerSandbox';
import { handler$} from 'jay-secure';
function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
    let [text, setText] = createState('');
    refs.input
        .onchange$(handler$('0'))
        .then(({event}) => setText(event.$0));
    refs.input2
        .onchange$(handler$('1'))
        .then(({event}) => setText(event.$0));
}
export const Comp = makeJayComponent(render, CompComponent);`),
            );
        });

        it('replace event.target.value for two event handler reusing the handler', async () => {
            const code = `
import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
import { CompElementRefs, render } from './generated-element';

function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
    let [text, setText] = createState('');
    function updateText({event}) {
        setText((event.target as HTMLInputElement).value);
    }
    refs.input.onchange(updateText);
    refs.input2.onchange(updateText);
}

export const Comp = makeJayComponent(render, CompComponent);`;

            const outputCode = await transformCode(code, [
                componentSecureFunctionsTransformer(input_value_pattern),
            ]);

            expect(outputCode).toEqual(
                await prettify(`
import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
import { CompElementRefs, render } from './generated-element?jay-workerSandbox';
import { handler$} from 'jay-secure';
function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
    let [text, setText] = createState('');
    function updateText({event}) {
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
import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
import { CompElementRefs, render } from './generated-element';

function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
    let [count, setCount] = createState('');
    refs.input.onchange(() => setCount(count()+1));
}

export const Comp = makeJayComponent(render, CompComponent);`;

            const outputCode = await transformCode(code, [
                componentSecureFunctionsTransformer(input_value_pattern),
            ]);

            expect(outputCode).toEqual(
                await prettify(`
import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
import { CompElementRefs, render } from './generated-element?jay-workerSandbox';
function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
    let [count, setCount] = createState('');
    refs.input.onchange(() => setCount(count()+1));
}
export const Comp = makeJayComponent(render, CompComponent);`),
            );
        });
    })
});
