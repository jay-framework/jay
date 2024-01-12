import { parseTsxFile } from '../../lib/tsx-file/parse-tsx-file';
import { JayFile, JayUnknown, MAKE_JAY_TSX_COMPONENT, WithValidations } from '../../lib';

describe('parseTsxFile', () => {
    const filename = 'dummy.tsx';
    const code = `
import { createState, makeJayTsxComponent, Props } from 'jay-component';

export interface CounterProps {
    initialValue: number;
}

function CounterConstructor({ initialValue }: Props<CounterProps>) {
    let [count, setCount] = createState(initialValue);

    return {
        render: () => (
            <div>
                <button onclick={() => setCount(count() - 1)}>-</button>
                {count() % 2 === 0 ?
                     <span style="color: red">{count()}</span> :
                     <span style="color: blue">{count()}</span>}
                <button onclick={() => setCount(count() + 1)}>+</button>
            </div>
        );
    };
}

export const Counter = makeJayTsxComponent(CounterConstructor);
`;

    it('returns JayFile', () => {
        expect(parseTsxFile(filename, code)).toEqual(
            new WithValidations({
                imports: [
                    {
                        module: 'jay-component',
                        names: [
                            { name: 'createState', type: JayUnknown },
                            { name: 'makeJayTsxComponent', type: JayUnknown },
                            { name: 'Props', type: JayUnknown },
                        ],
                        sandbox: false,
                    },
                ],
                baseElementName: 'Counter',
            } as JayFile),
        );
    });

    describe('on no component constructor', () => {
        const code = `
        | import { createState, makeJayTsxComponent, Props } from 'jay-component';
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
        | import { Props } from 'jay-component';
        | function CounterConstructor({ initialValue }: Props<CounterProps>) {}
        `;

        it('returns validation error', () => {
            const { val, validations } = parseTsxFile(filename, code);
            expect(validations[0]).toMatch(`Missing ${MAKE_JAY_TSX_COMPONENT} import`);
            expect(val).toBeUndefined();
        });
    });
});
