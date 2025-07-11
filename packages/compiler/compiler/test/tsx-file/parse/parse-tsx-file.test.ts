import { parseTsxFile } from '../../../lib/tsx-file/parse/parse-tsx-file';
import { JayUnknown, MAKE_JAY_TSX_COMPONENT, prettifyHtml } from '@jay-framework/compiler-shared';
import { JayTsxSourceFile } from '../../../lib/tsx-file/jsx-block';

describe('parseTsxFile', () => {
    const filename = 'dummy.tsx';
    const code = `
import { createSignal, makeJayTsxComponent, Props } from '@jay-framework/component';

export interface CounterProps {
    initialValue: number;
}

function CounterConstructor({ initialValue }: Props<CounterProps>) {
    let [count, setCount] = createSignal(initialValue);

    return {
        render: (
            <div>
                <button onclick={() => setCount(count() - 1)}>-</button>
                <span style="color: red">{'R' + count()}</span>
                <button onclick={() => setCount(count() + 1)}>+</button>
            </div>
        );
    };
}

export const Counter = makeJayTsxComponent(CounterConstructor);
`;

    it('returns JayFile', () => {
        const { val: jayFile, validations } = parseTsxFile(filename, code);

        expect(validations).toEqual([]);
        expect(jayFile).toMatchObject({
            imports: [
                {
                    module: '@jay-framework/component',
                    names: [
                        { name: 'createSignal', type: JayUnknown },
                        { name: 'makeJayTsxComponent', type: JayUnknown },
                        { name: 'Props', type: JayUnknown },
                    ],
                    sandbox: false,
                },
            ],
            baseElementName: 'Counter',
        } as JayTsxSourceFile);
        expect(prettifyHtml(jayFile.jsxBlock.getHtml())).toEqual(
            prettifyHtml(`
           <div>
               <button ref="_ref_0">-</button>
               <span style="color: red">{_memo_0()}</span>
               <button ref="_ref_1">+</button>
           </div>
        `),
        );
    });

    describe('on no component constructor', () => {
        const code = `
        | import { createSignal, makeJayTsxComponent, Props } from '@jay-framework/component';
        | function CounterConstructor({ initialValue }: Props<CounterProps>) {}
        `;

        it('returns validation error', () => {
            const { val, validations } = parseTsxFile(filename, code);
            expect(validations[0]).toMatch('Missing');
            expect(val).toBeUndefined();
        });
    });

    describe('on no makeJayTsxComponent import', () => {
        const code = `
        | import { Props } from '@jay-framework/component';
        | function CounterConstructor({ initialValue }: Props<CounterProps>) {}
        `;

        it('returns validation error', () => {
            const { val, validations } = parseTsxFile(filename, code);
            expect(validations[0]).toMatch(`Missing ${MAKE_JAY_TSX_COMPONENT} import`);
            expect(val).toBeUndefined();
        });
    });
});
