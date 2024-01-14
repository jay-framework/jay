import { printTsFile } from './test-utils/ts-compiler-test-utils';
import * as ts from 'typescript';
import {componentBridgeTransformer, componentSecureFunctionsTransformer, RuntimeMode} from '../lib';
import { prettify } from '../lib';

describe('transform component bridge', () => {
    const input_value_pattern = `
function inputValuePattern(handler: JayEventHandler<any, any, any>) {
    return handler.event.target.value;
}`;

    describe('generate function repository', () => {

        it('create event.target.value in function repository', async () => {
            const code = `
import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
import { CompElementRefs, render } from './generated-element';

function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
    let [text, setText] = createState('');
    refs.input.onchange(({event}) => setText((event.target as HTMLInputElement).value));
}

export const Comp = makeJayComponent(render, CompComponent);`;

            const sourceFile = ts.createSourceFile(
                'dummy.ts',
                code,
                ts.ScriptTarget.Latest,
                false,
                ts.ScriptKind.TS,
            );
            const outputFile = ts.transform(sourceFile, [
                componentBridgeTransformer(RuntimeMode.MainSandbox, [input_value_pattern]),
            ]);
            const outputCode = await prettify(printTsFile(outputFile));
            expect(outputCode).toEqual(
                await prettify(`
import { makeJayComponentBridge } from 'jay-secure';
import { render } from './generated-element?jay-mainSandbox';
const funcRepository: FunctionsRepository = {
    '0': ({ event }) => ({ $0: event.target.value }),
};
export const Comp = makeJayComponentBridge(render, { funcRepository });
`),
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

            const sourceFile = ts.createSourceFile(
                'dummy.ts',
                code,
                ts.ScriptTarget.Latest,
                false,
                ts.ScriptKind.TS,
            );
            const outputFile = ts.transform(sourceFile, [
                componentBridgeTransformer(RuntimeMode.MainSandbox, [input_value_pattern]),
            ]);
            const outputCode = await prettify(printTsFile(outputFile));
            expect(outputCode).toEqual(
                await prettify(`
import { makeJayComponentBridge } from 'jay-secure';
import { render } from './generated-element?jay-mainSandbox';
const funcRepository: FunctionsRepository = {
    '0': ({ event }) => ({ $0: event.target.value }),
    '1': ({ event }) => ({ $0: event.target.value })
};
export const Comp = makeJayComponentBridge(render, { funcRepository });
`),
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

            const sourceFile = ts.createSourceFile(
                'dummy.ts',
                code,
                ts.ScriptTarget.Latest,
                false,
                ts.ScriptKind.TS,
            );
            const outputFile = ts.transform(sourceFile, [
                componentBridgeTransformer(RuntimeMode.MainSandbox, [input_value_pattern]),
            ]);
            const outputCode = await prettify(printTsFile(outputFile));
            expect(outputCode).toEqual(
                await prettify(`
import { makeJayComponentBridge } from 'jay-secure';
import { render } from './generated-element?jay-mainSandbox';
const funcRepository: FunctionsRepository = {
    '0': ({ event }) => ({ $0: event.target.value }),
};
export const Comp = makeJayComponentBridge(render, { funcRepository });`),
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

            const sourceFile = ts.createSourceFile(
                'dummy.ts',
                code,
                ts.ScriptTarget.Latest,
                false,
                ts.ScriptKind.TS,
            );
            const outputFile = ts.transform(sourceFile, [
                componentBridgeTransformer(RuntimeMode.MainSandbox, [input_value_pattern]),
            ]);
            const outputCode = await prettify(printTsFile(outputFile));
            expect(outputCode).toEqual(
                await prettify(`
import { makeJayComponentBridge } from 'jay-secure';
import { render } from './generated-element?jay-mainSandbox';
export const Comp = makeJayComponentBridge(render);`),
            );
        });

    })
});
