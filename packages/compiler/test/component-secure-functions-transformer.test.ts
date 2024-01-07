import { printTsFile } from './test-utils/ts-compiler-test-utils';
import * as ts from 'typescript';
import { componentSecureFunctionsTransformer } from '../lib/ts-file/component-secure-functions-transformer.ts';
import { prettify } from '../lib';

describe('transform event handlers with secure code split', () => {
    const input_value_pattern = `
function inputValuePattern(handler: JayEventHandler<any, any, any>) {
    return handler.event.target.value;
}`;

    it('replace event.target.value for a single event handler', async () => {
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
            componentSecureFunctionsTransformer([input_value_pattern]),
        ]);
        const outputCode = await prettify(printTsFile(outputFile));
        expect(outputCode).toEqual(
            await prettify(`
import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
import { CompElementRefs, render } from './generated-element';
function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
    let [text, setText] = createState('');
    refs.input
        .onchange$(handler$('0'))
        .onchange(({event}) => setText(event.$1));
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

        const sourceFile = ts.createSourceFile(
            'dummy.ts',
            code,
            ts.ScriptTarget.Latest,
            false,
            ts.ScriptKind.TS,
        );
        const outputFile = ts.transform(sourceFile, [
            componentSecureFunctionsTransformer([input_value_pattern]),
        ]);
        const outputCode = await prettify(printTsFile(outputFile));
        expect(outputCode).toEqual(
            await prettify(`
import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
import { CompElementRefs, render } from './generated-element';
function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
    let [text, setText] = createState('');
    refs.input
        .onchange$(handler$('0'))
        .onchange(({event}) => setText(event.$1));
    refs.input2
        .onchange$(handler$('1'))
        .onchange(({event}) => setText(event.$1));
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

        const sourceFile = ts.createSourceFile(
            'dummy.ts',
            code,
            ts.ScriptTarget.Latest,
            false,
            ts.ScriptKind.TS,
        );
        const outputFile = ts.transform(sourceFile, [
            componentSecureFunctionsTransformer([input_value_pattern]),
        ]);
        const outputCode = await prettify(printTsFile(outputFile));
        expect(outputCode).toEqual(
            await prettify(`
import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
import { CompElementRefs, render } from './generated-element';
function CompComponent({  }: Props<CompProps>, refs: CompElementRefs) {
    let [text, setText] = createState('');
    function updateText({event}) {
        setText(event.$1);
    }
    refs.input
        .onchange$(handler$('0'))
        .onchange(updateText);
    refs.input2
        .onchange$(handler$('0'))
        .onchange(updateText);
}
export const Comp = makeJayComponent(render, CompComponent);`),
        );
    });

});
