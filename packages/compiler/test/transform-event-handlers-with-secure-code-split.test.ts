import { printTsFile } from './test-utils/ts-compiler-test-utils';
import * as ts from 'typescript';
import { componentSecureFunctionsTransformer } from '../lib/ts-file/component-secure-functions-transformer.ts';
import { prettify } from '../lib';

describe('transform event handlers with secure code split', () => {
    const input_value_pattern = `
function inputValuePattern(event: Event) {
    return event.target.value;
}`;

    it.skip('replace event.target.value', async () => {
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
        .onchange$(handler$('1'))
        .onchange(({event:{value}}) => setText(value));
}
export const Comp = makeJayComponent(render, CompComponent);`),
        );
    });
});
