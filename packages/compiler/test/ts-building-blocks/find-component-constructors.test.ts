import ts, { isArrowFunction, isFunctionDeclaration, isFunctionExpression } from 'typescript';
import { findComponentConstructorsBlock } from '../../lib/ts-file/building-blocks/find-component-constructors';
import { createTsSourceFile } from '../test-utils/ts-source-utils';
import {
    findComponentConstructorCallsBlock,
    FindComponentConstructorType,
} from '../../lib/ts-file/building-blocks/find-component-constructor-calls';
import { SourceFileBindingResolver } from '../../lib/ts-file/building-blocks/source-file-binding-resolver';

describe('findComponentConstructorsBlock', () => {
    function findConstructors(sourceFile: ts.SourceFile) {
        const bindingResolver = new SourceFileBindingResolver(sourceFile);
        const componentFunctionExpressions = findComponentConstructorCallsBlock(
            FindComponentConstructorType.makeJayComponent,
            bindingResolver,
            sourceFile,
        ).map(({ comp }) => comp);
        return findComponentConstructorsBlock(componentFunctionExpressions, sourceFile);
    }

    it('find private named component constructor', async () => {
        const sourceFile = createTsSourceFile(`
        | import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
        | }
        |
        | export const Counter = makeJayComponent(render, CounterComponent);`);
        const foundFunctions = findConstructors(sourceFile);
        expect(foundFunctions).toHaveLength(1);
        expect(isFunctionDeclaration(foundFunctions[0])).toBeTruthy();
    });

    it('find private named arrow component constructor', async () => {
        const sourceFile = createTsSourceFile(`
        | import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | const CounterComponent = ({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) => {
        | }
        |
        | export const Counter = makeJayComponent(render, CounterComponent);`);
        const foundFunctions = findConstructors(sourceFile);
        expect(foundFunctions).toHaveLength(1);
        expect(isArrowFunction(foundFunctions[0])).toBeTruthy();
    });

    it('find inline named component constructor', async () => {
        const sourceFile = createTsSourceFile(`
        | import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | export const Counter = makeJayComponent(render, 
        |   function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
        |   });`);
        const foundFunctions = findConstructors(sourceFile);
        expect(foundFunctions).toHaveLength(1);
        expect(isFunctionExpression(foundFunctions[0])).toBeTruthy();
    });

    it('find inline component constructor', async () => {
        const sourceFile = createTsSourceFile(`
        | import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | export const Counter = makeJayComponent(render, 
        |   function ({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
        |   });`);
        const foundFunctions = findConstructors(sourceFile);
        expect(foundFunctions).toHaveLength(1);
        expect(isFunctionExpression(foundFunctions[0])).toBeTruthy();
    });

    it('find inline arrow component constructor', async () => {
        const sourceFile = createTsSourceFile(`
        | import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | export const Counter = makeJayComponent(render, 
        |   ({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) => {
        |   });`);
        const foundFunctions = findConstructors(sourceFile);
        expect(foundFunctions).toHaveLength(1);
        expect(isArrowFunction(foundFunctions[0])).toBeTruthy();
    });
});
