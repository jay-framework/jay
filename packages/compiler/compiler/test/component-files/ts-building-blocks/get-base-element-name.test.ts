import ts from 'typescript';
import { createTsSourceFile } from '../../test-utils/ts-source-utils';
import { getBaseElementName } from '../../../lib/components-files/building-blocks/get-base-element-name';
import {
    findComponentConstructorCallsBlock,
    FindComponentConstructorType,
} from '../../../lib/components-files/building-blocks/find-component-constructor-calls';
import { SourceFileBindingResolver } from '../../../lib/components-files/basic-analyzers/source-file-binding-resolver';
import { MAKE_JAY_TSX_COMPONENT } from 'jay-compiler-shared';

describe('getBaseElementName', () => {
    const makeJayTsxComponentName = MAKE_JAY_TSX_COMPONENT;
    function getName(sourceFile: ts.SourceFile) {
        const bindingResolver = new SourceFileBindingResolver(sourceFile);
        const componentConstructorCalls = findComponentConstructorCallsBlock(
            FindComponentConstructorType.makeJayTsxComponent,
            bindingResolver,
            sourceFile,
        );
        return getBaseElementName(makeJayTsxComponentName, componentConstructorCalls);
    }

    const sourceFile = createTsSourceFile(`
        | import { createEvent, createSignal, makeJayTsxComponent, Props } from 'jay-component';
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
        | import { createEvent, createSignal, makeJayTsxComponent, Props } from 'jay-component';
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
        | import { createEvent, createSignal, makeJayTsxComponent, Props } from 'jay-component';
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
