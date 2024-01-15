import { findComponentConstructorsBlock } from '../../lib/ts-file/building-blocks/find-component-constructors';
import ts from 'typescript';
import { findEventHandlersBlock } from '../../lib/ts-file/building-blocks/find-event-handler-functions';
import { astToCode } from '../../lib/ts-file/ts-compiler-utils';
import { createTsSourceFile } from '../test-utils/ts-source-utils';
import { findMakeJayComponentConstructorCallsBlock } from '../../lib/ts-file/building-blocks/find-make-jay-component-constructor-calls';
import { MAKE_JAY_COMPONENT } from '../../lib';

describe('findEventHandlersBlock', () => {
    function findEventHandlerFunctions(sourceFile: ts.SourceFile) {
        const componentFunctionExpressions = findMakeJayComponentConstructorCallsBlock(
            MAKE_JAY_COMPONENT,
            sourceFile,
        ).map(({ comp }) => comp);
        const foundConstructors = findComponentConstructorsBlock(
            componentFunctionExpressions,
            sourceFile,
        );
        return foundConstructors.flatMap((constructor) => findEventHandlersBlock(constructor));
    }

    it('defined as inline arrow functions based on ref object', async () => {
        const sourceFile = createTsSourceFile(`
        | import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
        |   refs.subtracter.onclick(() => setCount(count() - 1));
        |   refs.adderButton.onclick(() => setCount(count() + 1));
        | }
        |
        | export const Counter = makeJayComponent(render, CounterComponent);`);
        const foundFunctions = findEventHandlerFunctions(sourceFile);
        expect(foundFunctions).toHaveLength(2);
        expect(astToCode(foundFunctions[0].eventHandler)).toBe('() => setCount(count() - 1)');
        expect(astToCode(foundFunctions[0].eventHandlerCallStatement)).toBe(
            'refs.subtracter.onclick(() => setCount(count() - 1));',
        );
        expect(foundFunctions[0].handlerIndex).toBe(0);
        expect(astToCode(foundFunctions[1].eventHandler)).toBe('() => setCount(count() + 1)');
        expect(astToCode(foundFunctions[1].eventHandlerCallStatement)).toBe(
            'refs.adderButton.onclick(() => setCount(count() + 1));',
        );
        expect(foundFunctions[1].handlerIndex).toBe(1);
    });

    it('defined as inline arrow functions based on ref object and variable bindings', async () => {
        const sourceFile = createTsSourceFile(`
        | import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
        |   let subtracter = refs.subtracter;
        |   let adderButton = refs.adderButton; 
        |   subtracter.onclick(() => setCount(count() - 1));
        |   adderButton.onclick(() => setCount(count() + 1));
        | }
        |
        | export const Counter = makeJayComponent(render, CounterComponent);`);
        const foundFunctions = findEventHandlerFunctions(sourceFile);
        expect(foundFunctions).toHaveLength(2);
        expect(astToCode(foundFunctions[0].eventHandler)).toBe('() => setCount(count() - 1)');
        expect(astToCode(foundFunctions[0].eventHandlerCallStatement)).toBe(
            'subtracter.onclick(() => setCount(count() - 1));',
        );
        expect(foundFunctions[0].handlerIndex).toBe(0);
        expect(astToCode(foundFunctions[1].eventHandler)).toBe('() => setCount(count() + 1)');
        expect(astToCode(foundFunctions[1].eventHandlerCallStatement)).toBe(
            'adderButton.onclick(() => setCount(count() + 1));',
        );
        expect(foundFunctions[1].handlerIndex).toBe(1);
    });

    it('defined as inline arrow functions based on refs object property binding', async () => {
        const sourceFile = createTsSourceFile(`
        | import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | function CounterComponent({ initialValue }: Props<CounterProps>, {subtracter, adderButton}: CounterElementRefs) {
        |   subtracter.onclick(() => setCount(count() - 1));
        |   adderButton.onclick(() => setCount(count() + 1));
        | }
        |
        | export const Counter = makeJayComponent(render, CounterComponent);`);
        const foundFunctions = findEventHandlerFunctions(sourceFile);
        expect(foundFunctions).toHaveLength(2);
        expect(astToCode(foundFunctions[0].eventHandler)).toBe('() => setCount(count() - 1)');
        expect(astToCode(foundFunctions[0].eventHandlerCallStatement)).toBe(
            'subtracter.onclick(() => setCount(count() - 1));',
        );
        expect(foundFunctions[0].handlerIndex).toBe(0);
        expect(astToCode(foundFunctions[1].eventHandler)).toBe('() => setCount(count() + 1)');
        expect(astToCode(foundFunctions[1].eventHandlerCallStatement)).toBe(
            'adderButton.onclick(() => setCount(count() + 1));',
        );
        expect(foundFunctions[1].handlerIndex).toBe(1);
    });

    it('defined as regular function', async () => {
        const sourceFile = createTsSourceFile(`
        | import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
        |   function subtract() {
        |     setCount(count() - 1);
        |   }
        |   function add() {
        |     setCount(count() + 1);
        |   }
        |   refs.subtracter.onclick(subtract);
        |   refs.adderButton.onclick(add);
        | }
        |
        | export const Counter = makeJayComponent(render, CounterComponent);`);
        const foundFunctions = findEventHandlerFunctions(sourceFile);
        expect(foundFunctions).toHaveLength(2);
        expect(astToCode(foundFunctions[0].eventHandler)).toBe(`function subtract() {
    setCount(count() - 1);
}`);
        expect(astToCode(foundFunctions[0].eventHandlerCallStatement)).toBe(
            'refs.subtracter.onclick(subtract);',
        );
        expect(foundFunctions[0].handlerIndex).toBe(0);
        expect(astToCode(foundFunctions[1].eventHandler)).toBe(`function add() {
    setCount(count() + 1);
}`);
        expect(astToCode(foundFunctions[1].eventHandlerCallStatement)).toBe(
            'refs.adderButton.onclick(add);',
        );
        expect(foundFunctions[1].handlerIndex).toBe(1);
    });

    it('defined as const arrow function', async () => {
        const sourceFile = createTsSourceFile(`
        | import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
        |   const subtract = () => setCount(count() - 1);
        |   const add = () => setCount(count() + 1);
        |   refs.subtracter.onclick(subtract);
        |   refs.adderButton.onclick(add);
        | }
        |
        | export const Counter = makeJayComponent(render, CounterComponent);`);
        const foundFunctions = findEventHandlerFunctions(sourceFile);
        expect(foundFunctions).toHaveLength(2);
        expect(astToCode(foundFunctions[0].eventHandler)).toBe('() => setCount(count() - 1)');
        expect(astToCode(foundFunctions[0].eventHandlerCallStatement)).toBe(
            'refs.subtracter.onclick(subtract);',
        );
        expect(foundFunctions[0].handlerIndex).toBe(0);
        expect(astToCode(foundFunctions[1].eventHandler)).toBe('() => setCount(count() + 1)');
        expect(astToCode(foundFunctions[1].eventHandlerCallStatement)).toBe(
            'refs.adderButton.onclick(add);',
        );
        expect(foundFunctions[1].handlerIndex).toBe(1);
    });

    it('defined as const anonymous function', async () => {
        const sourceFile = createTsSourceFile(`
        | import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
        |   const subtract = function() { setCount(count() - 1)};
        |   const add = function() { setCount(count() + 1)};
        |   refs.subtracter.onclick(subtract);
        |   refs.adderButton.onclick(add);
        | }
        |
        | export const Counter = makeJayComponent(render, CounterComponent);`);
        const foundFunctions = findEventHandlerFunctions(sourceFile);
        expect(foundFunctions).toHaveLength(2);
        expect(astToCode(foundFunctions[0].eventHandler)).toBe(
            'function () { setCount(count() - 1); }',
        );
        expect(astToCode(foundFunctions[0].eventHandlerCallStatement)).toBe(
            'refs.subtracter.onclick(subtract);',
        );
        expect(astToCode(foundFunctions[1].eventHandler)).toBe(
            'function () { setCount(count() + 1); }',
        );
        expect(astToCode(foundFunctions[1].eventHandlerCallStatement)).toBe(
            'refs.adderButton.onclick(add);',
        );
    });

    it('both events are using the same function (a bug in the component logic, valid in other cases)', async () => {
        const sourceFile = createTsSourceFile(`
        | import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
        |   const add = function() { setCount(count() + 1)};
        |   refs.subtracter.onclick(add);
        |   refs.adderButton.onclick(add);
        | }
        |
        | export const Counter = makeJayComponent(render, CounterComponent);`);
        const foundFunctions = findEventHandlerFunctions(sourceFile);
        expect(foundFunctions).toHaveLength(2);
        expect(astToCode(foundFunctions[0].eventHandler)).toBe(
            'function () { setCount(count() + 1); }',
        );
        expect(astToCode(foundFunctions[0].eventHandlerCallStatement)).toBe(
            'refs.subtracter.onclick(add);',
        );
        expect(foundFunctions[0].handlerIndex).toBe(0);
        expect(astToCode(foundFunctions[1].eventHandler)).toBe(
            'function () { setCount(count() + 1); }',
        );
        expect(astToCode(foundFunctions[1].eventHandlerCallStatement)).toBe(
            'refs.adderButton.onclick(add);',
        );
        expect(foundFunctions[1].handlerIndex).toBe(0);
    });

    it('defined as nested object function', async () => {
        const sourceFile = createTsSourceFile(`
        | import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
        |   const events = {
        |     subtract: function() { setCount(count() - 1)},
        |     add: function() { setCount(count() + 1)}
        |   }
        |   refs.subtracter.onclick(events.subtract);
        |   refs.adderButton.onclick(events.add);
        | }
        |
        | export const Counter = makeJayComponent(render, CounterComponent);`);
        const foundFunctions = findEventHandlerFunctions(sourceFile);
        expect(foundFunctions).toHaveLength(2);
        expect(astToCode(foundFunctions[0].eventHandler)).toBe(
            'function () { setCount(count() - 1); }',
        );
        expect(astToCode(foundFunctions[0].eventHandlerCallStatement)).toBe(
            'refs.subtracter.onclick(events.subtract);',
        );
        expect(astToCode(foundFunctions[1].eventHandler)).toBe(
            'function () { setCount(count() + 1); }',
        );
        expect(astToCode(foundFunctions[1].eventHandlerCallStatement)).toBe(
            'refs.adderButton.onclick(events.add);',
        );
    });
});
