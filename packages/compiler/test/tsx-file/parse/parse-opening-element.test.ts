import ts from 'typescript';
import { createTsxSourceFile } from '../../test-utils/ts-source-utils';
import { parseOpeningElement } from '../../../lib/tsx-file/parse/parse-opening-element';

describe('parseOpeningElementText', () => {
    function parseText(sourceFile: ts.SourceFile) {
        const element = (sourceFile.statements[0] as ts.ExpressionStatement).expression as
            | ts.JsxOpeningElement
            | ts.JsxSelfClosingElement;
        // @ts-expect-error there's no single accessor for these types
        return parseOpeningElement(element.openingElement || element);
    }

    const sourceFile = createTsxSourceFile(` 
        <button style="color: red" about={1 + 1} onclick={() => setCount(count() - 1)}>-</button>
    `);

    it('returns jsx block with recorded body, refs and memos', () => {
        const jsxBlock = parseText(sourceFile).prettified();

        expect(jsxBlock).toEqual({
            html: '<button style="color: red" about={_memo_0()} ref="_ref_0">',
            refs: ['() => setCount(count() - 1)'],
            memos: ['1 + 1'],
            validations: [],
        });
    });

    describe('on empty JSX node', () => {
        const sourceFile = createTsxSourceFile(` 
        <button>-</button>
    `);

        it('returns jsx block', () => {
            const jsxBlock = parseText(sourceFile).prettified();

            expect(jsxBlock).toEqual({
                html: '<button>',
                refs: [],
                memos: [],
                validations: [],
            });
        });
    });

    describe('on unsupported JSX node', () => {
        const sourceFile = createTsxSourceFile(`
            <div onclick={handler}/>
        `);

        it('contains validation error', () => {
            const jsxBlock = parseText(sourceFile);

            expect(jsxBlock.validations.length).toEqual(1);
            expect(jsxBlock.validations[0]).toMatch('Unsupported attribute');
        });
    });
});
