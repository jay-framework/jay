import ts from 'typescript';
import { createTsxSourceFile } from '../test-utils/ts-source-utils';
import { parseJsx } from '../../lib/tsx-file/parse-jsx';
import { prettifyHtml } from '../../lib/utils/prettify';

describe('parseJsx', () => {
    function parse(sourceFile: ts.SourceFile) {
        return parseJsx(sourceFile.statements[0] as unknown as ts.Expression, { debug: false });
    }

    const sourceFile = createTsxSourceFile(`(
        <div>
            <button onclick={() => setCount(count() - 1)}>-</button>
            <span style="color: red">{'R' + count()}</span>
            <button onclick={() => setCount(count() + 1)}>+</button>
            <div style="visibility: hidden"/>
        </div>
    `);

    it('returns parsed body with refs', () => {
        const jsxBlock = parse(sourceFile).prettified();
        expect(jsxBlock).toEqual({
            html: prettifyHtml(`
                <div>
                    <button ref="_ref_0">-</button>
                    <span style="color: red">{_memo_0()}</span>
                    <button ref="_ref_1">+</button>
                    <div style="visibility: hidden"/>
                </div>
            `),
            refs: ['() => setCount(count() - 1)', '() => setCount(count() + 1)'],
            memos: ['"R" + count()'],
            validations: [],
        });
    });

    describe('on unsupported JSX node', () => {
        const sourceFile = createTsxSourceFile(`
        <div onclick={handler}/>
    `);

        it('returns validation error', () => {
            const jsxBlock = parse(sourceFile);

            expect(jsxBlock.validations.length).toEqual(1);
            expect(jsxBlock.validations[0]).toMatch('Unsupported attribute');
        });
    });
});
