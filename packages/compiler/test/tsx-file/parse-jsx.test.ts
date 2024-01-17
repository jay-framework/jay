import ts from 'typescript';
import { createTsSourceFile } from '../test-utils/ts-source-utils';
import { parseJsx } from '../../lib/tsx-file/parse-jsx';
import { prettifyHtml } from '../../lib/utils/prettify';

describe.skip('parseJsx', () => {
    function parse(sourceFile: ts.SourceFile) {
        return parseJsx(sourceFile.statements[0] as unknown as ts.Expression);
    }

    const sourceFile = createTsSourceFile(`
        <div>
            <button onclick={() => setCount(count() - 1)}>-</button>
            <span style="color: red">{'R' + count()}</span>
            <button onclick={() => setCount(count() + 1)}>+</button>
        </div>
    `);

    it('returns parsed body with refs', async () => {
        const jsxBlock = await parse(sourceFile).prettified();

        expect(jsxBlock).toEqual({
            html: await prettifyHtml(`
                <div>
                    <button ref="_ref_0">-</button>
                    <span style="color: red">{_memo_0()}</span>
                    <button ref="_ref_1">+</button>
                    <div style="visibility: hidden"/>
                </div>
            `),
            refs: ['() => setCount(count() - 1)', '() => setCount(count() + 1)'],
            memos: ["'R' + count()"],
            validations: [],
        });
    });

    describe('on unsupported JSX node', () => {
        const sourceFile = createTsSourceFile(`
        <div onclick={handler}/>
    `);

        it('returns validation error', () => {
            const jsxBlock = parse(sourceFile);

            expect(jsxBlock.validations.length).toEqual(1);
            expect(jsxBlock.validations[0]).toMatch('Unsupported attribute');
        });
    });
});
