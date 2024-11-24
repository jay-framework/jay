import { transform } from 'typescript';

import { tsxComponentTransformer } from '../../../lib/tsx-file/transform/tsx-component-transformer';
import { JayTsxSourceFile, WithValidations } from '../../../lib';
import { createTsxSourceFile } from '../../test-utils/ts-source-utils';
import { parseTsxFile } from '../../../lib/tsx-file/parse/parse-tsx-file';

describe('tsxComponentTransformer', () => {
    function transformFile(code: string): WithValidations<string> {
        const sourceFile = createTsxSourceFile(code);
        const jayTsxFile = parseTsxFile(sourceFile.fileName, sourceFile.text);
        return jayTsxFile.flatMap((jayTsxFile: JayTsxSourceFile) => {
            const transformed = transform(sourceFile, [tsxComponentTransformer(jayTsxFile)]);
            return new WithValidations(
                transformed.transformed[0].getText(),
                transformed.diagnostics.map((diagnostic) => diagnostic.toString()),
            );
        });
    }

    const source = `
import { createSignal, makeJayTsxComponent, Props } from 'jay-component';

export interface CounterProps {
    initialValue: number;
}

function CounterConstructor({ initialValue }: Props<CounterProps>) {
    let [count, setCount] = createSignal(initialValue);

    return {
        render: (
            <div>
                <button onclick={() => setCount(count() - 1)}>-</button>
                <span style="color: red">{"R" + count()}</span>
                <button onclick={() => setCount(count() + 1)}>+</button>
            </div>
        );
    };
}

export const Counter = makeJayTsxComponent(CounterConstructor);
`;

    // TODO implement logic to pass the test
    it.skip('returns component code', () => {
        const { val: code, validations } = transformFile(source);
        expect(validations).toEqual([]);
        expect(code).toEqual(`
import { CounterElementRefs, render } from './counter.jay-html';
import { makeJayComponent, Props, createMemo, createSignal } from 'jay-component';

export interface CounterProps {
    initialValue: number;
}

function CounterConstructor(
  { initialValue }: Props<CounterProps>,
  refs: CounterElementRefs
) {
    let [count, setCount] = createSignal(initialValue);

    refs._ref_0.onclick(() => setCount(count() - 1));
    refs._ref_1.onclick(() => setCount(count() + 1));
    const _memo_0 = createMemo(() => "R" + count());

    return {
        render: () => ({ count, _memo_0 }),
    };
}

export const Counter = makeJayComponent(CounterConstructor);
        `);
    });
});
