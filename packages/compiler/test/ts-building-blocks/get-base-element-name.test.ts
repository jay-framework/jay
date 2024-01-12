import ts from 'typescript';
import { findComponentConstructorCallsBlock } from '../../lib/ts-file/building-blocks/find-component-constructor-calls';
import { createTsSourceFile } from '../test-utils/ts-source-utils';
import { getBaseElementName } from '../../lib/ts-file/building-blocks/get-base-element-name';

describe('getBaseElementName', () => {
    const makeJayTsxComponentName = 'makeJayTsxComponent';
    function getName(sourceFile: ts.SourceFile) {
        const componentConstructorCalls = findComponentConstructorCallsBlock(
            makeJayTsxComponentName,
            sourceFile,
        );
        return getBaseElementName(makeJayTsxComponentName, componentConstructorCalls);
    }

    const sourceFile = createTsSourceFile(`
        | import { createEvent, createState, makeJayTsxComponent, Props } from 'jay-component';
        | function CounterConstructor({ initialValue }: Props<CounterProps>) {}
        | export const Counter = makeJayTsxComponent(CounterConstructor);
        `);

    it('returns first component constructor name text', () => {
        const { val: name, validations } = getName(sourceFile);
        expect(validations).toEqual([]);
        expect(name).toEqual('Counter');
    });

    describe('on no component constructor', () => {
        const sourceFile = createTsSourceFile(`
        | import { createEvent, createState, makeJayTsxComponent, Props } from 'jay-component';
        | export function CounterConstructor({ initialValue }: Props<CounterProps>) {}
        `);

        it('returns validation error', () => {
            const { val: name, validations } = getName(sourceFile);
            expect(validations[0]).toMatch('Missing');
            expect(name).toBeUndefined();
        });
    });

    describe('on more than one component constructor', () => {
        const sourceFile = createTsSourceFile(`
        | import { createEvent, createState, makeJayTsxComponent, Props } from 'jay-component';
        | function CounterConstructor({ initialValue }: Props<CounterProps>) {}
        | export const Counter = makeJayTsxComponent(CounterConstructor);
        | export const Counter2 = makeJayTsxComponent(CounterConstructor);
        `);

        it('returns validation error', () => {
            const { val: name, validations } = getName(sourceFile);
            expect(validations[0]).toMatch('Multiple');
            expect(name).toBeUndefined();
        });
    });
});
