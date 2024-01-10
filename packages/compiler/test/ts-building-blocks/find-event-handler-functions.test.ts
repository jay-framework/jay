import { mkTransformer } from '../../lib/ts-file/mk-transformer';
import { findComponentConstructorCallsBlock } from '../../lib/ts-file/building-blocks/find-component-constructor-calls';
import { findComponentConstructorsBlock } from '../../lib/ts-file/building-blocks/find-component-constructors';
import ts, { TransformerFactory } from 'typescript';
import {
    findEventHandlersBlock,
    FoundEventHandler,
} from '../../lib/ts-file/building-blocks/find-event-handler-functions';
import { stripMargin } from '../test-utils/strip-margin';
import { transformCode } from '../test-utils/ts-compiler-test-utils';
import { astToCode } from '../../lib/ts-file/ts-compiler-utils';

describe('find component event handlers', () => {
    function testTransformer() {
        let state = {
            foundFunctions: undefined,
            transformer: mkTransformer((sourceFileTransformerData) => {
                let componentConstructorCalls = findComponentConstructorCallsBlock(
                    'makeJayComponent',
                    sourceFileTransformerData,
                );
                let componentFunctionExpressions = componentConstructorCalls.map(
                    ({ comp }) => comp,
                );

                let foundConstructors = findComponentConstructorsBlock(
                    componentFunctionExpressions,
                    sourceFileTransformerData,
                );

                state.foundFunctions = foundConstructors.flatMap((constructor) =>
                    findEventHandlersBlock(constructor, sourceFileTransformerData),
                );

                return sourceFileTransformerData.sourceFile;
            }),
        };
        return state as {
            foundFunctions: FoundEventHandler[];
            transformer: TransformerFactory<ts.SourceFile>;
        };
    }

    it('defined as inline arrow functions based on ref object', async () => {
        const code =
            stripMargin(`import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
        |   refs.subtracter.onclick(() => setCount(count() - 1));
        |   refs.adderButton.onclick(() => setCount(count() + 1));
        | }
        |
        | export const Counter = makeJayComponent(render, CounterComponent);`);
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);
        expect(transformerState.foundFunctions).toHaveLength(2);
        expect(astToCode(transformerState.foundFunctions[0].eventHandler)).toBe(
            '() => setCount(count() - 1)',
        );
        expect(astToCode(transformerState.foundFunctions[0].eventHandlerCallStatement)).toBe(
            'refs.subtracter.onclick(() => setCount(count() - 1));',
        );
        expect(transformerState.foundFunctions[0].handlerIndex).toBe(0);
        expect(astToCode(transformerState.foundFunctions[1].eventHandler)).toBe(
            '() => setCount(count() + 1)',
        );
        expect(astToCode(transformerState.foundFunctions[1].eventHandlerCallStatement)).toBe(
            'refs.adderButton.onclick(() => setCount(count() + 1));',
        );
        expect(transformerState.foundFunctions[1].handlerIndex).toBe(1);
    });

    it('defined as inline arrow functions based on ref object and variable bindings', async () => {
        const code =
            stripMargin(`import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
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
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);
        expect(transformerState.foundFunctions).toHaveLength(2);
        expect(astToCode(transformerState.foundFunctions[0].eventHandler)).toBe(
            '() => setCount(count() - 1)',
        );
        expect(astToCode(transformerState.foundFunctions[0].eventHandlerCallStatement)).toBe(
            'subtracter.onclick(() => setCount(count() - 1));',
        );
        expect(transformerState.foundFunctions[0].handlerIndex).toBe(0);
        expect(astToCode(transformerState.foundFunctions[1].eventHandler)).toBe(
            '() => setCount(count() + 1)',
        );
        expect(astToCode(transformerState.foundFunctions[1].eventHandlerCallStatement)).toBe(
            'adderButton.onclick(() => setCount(count() + 1));',
        );
        expect(transformerState.foundFunctions[1].handlerIndex).toBe(1);
    });

    it('defined as inline arrow functions based on refs object property binding', async () => {
        const code =
            stripMargin(`import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | function CounterComponent({ initialValue }: Props<CounterProps>, {subtracter, adderButton}: CounterElementRefs) {
        |   subtracter.onclick(() => setCount(count() - 1));
        |   adderButton.onclick(() => setCount(count() + 1));
        | }
        |
        | export const Counter = makeJayComponent(render, CounterComponent);`);
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);
        expect(transformerState.foundFunctions).toHaveLength(2);
        expect(astToCode(transformerState.foundFunctions[0].eventHandler)).toBe(
            '() => setCount(count() - 1)',
        );
        expect(astToCode(transformerState.foundFunctions[0].eventHandlerCallStatement)).toBe(
            'subtracter.onclick(() => setCount(count() - 1));',
        );
        expect(transformerState.foundFunctions[0].handlerIndex).toBe(0);
        expect(astToCode(transformerState.foundFunctions[1].eventHandler)).toBe(
            '() => setCount(count() + 1)',
        );
        expect(astToCode(transformerState.foundFunctions[1].eventHandlerCallStatement)).toBe(
            'adderButton.onclick(() => setCount(count() + 1));',
        );
        expect(transformerState.foundFunctions[1].handlerIndex).toBe(1);
    });

    it('defined as regular function', async () => {
        const code =
            stripMargin(`import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
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
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);
        expect(transformerState.foundFunctions).toHaveLength(2);
        expect(astToCode(transformerState.foundFunctions[0].eventHandler))
            .toBe(`function subtract() {
    setCount(count() - 1);
}`);
        expect(astToCode(transformerState.foundFunctions[0].eventHandlerCallStatement)).toBe(
            'refs.subtracter.onclick(subtract);',
        );
        expect(transformerState.foundFunctions[0].handlerIndex).toBe(0);
        expect(astToCode(transformerState.foundFunctions[1].eventHandler)).toBe(`function add() {
    setCount(count() + 1);
}`);
        expect(astToCode(transformerState.foundFunctions[1].eventHandlerCallStatement)).toBe(
            'refs.adderButton.onclick(add);',
        );
        expect(transformerState.foundFunctions[1].handlerIndex).toBe(1);
    });

    it('defined as const arrow function', async () => {
        const code =
            stripMargin(`import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
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
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);
        expect(transformerState.foundFunctions).toHaveLength(2);
        expect(astToCode(transformerState.foundFunctions[0].eventHandler)).toBe(
            '() => setCount(count() - 1)',
        );
        expect(astToCode(transformerState.foundFunctions[0].eventHandlerCallStatement)).toBe(
            'refs.subtracter.onclick(subtract);',
        );
        expect(transformerState.foundFunctions[0].handlerIndex).toBe(0);
        expect(astToCode(transformerState.foundFunctions[1].eventHandler)).toBe(
            '() => setCount(count() + 1)',
        );
        expect(astToCode(transformerState.foundFunctions[1].eventHandlerCallStatement)).toBe(
            'refs.adderButton.onclick(add);',
        );
        expect(transformerState.foundFunctions[1].handlerIndex).toBe(1);
    });

    it('defined as const anonymous function', async () => {
        const code =
            stripMargin(`import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
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
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);
        expect(transformerState.foundFunctions).toHaveLength(2);
        expect(astToCode(transformerState.foundFunctions[0].eventHandler)).toBe(
            'function () { setCount(count() - 1); }',
        );
        expect(astToCode(transformerState.foundFunctions[0].eventHandlerCallStatement)).toBe(
            'refs.subtracter.onclick(subtract);',
        );
        expect(astToCode(transformerState.foundFunctions[1].eventHandler)).toBe(
            'function () { setCount(count() + 1); }',
        );
        expect(astToCode(transformerState.foundFunctions[1].eventHandlerCallStatement)).toBe(
            'refs.adderButton.onclick(add);',
        );
    });

    it('both events are using the same function (a bug in the component logic, valid in other cases)', async () => {
        const code =
            stripMargin(`import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
        |   const add = function() { setCount(count() + 1)};
        |   refs.subtracter.onclick(add);
        |   refs.adderButton.onclick(add);
        | }
        |
        | export const Counter = makeJayComponent(render, CounterComponent);`);
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);
        expect(transformerState.foundFunctions).toHaveLength(2);
        expect(astToCode(transformerState.foundFunctions[0].eventHandler)).toBe(
            'function () { setCount(count() + 1); }',
        );
        expect(astToCode(transformerState.foundFunctions[0].eventHandlerCallStatement)).toBe(
            'refs.subtracter.onclick(add);',
        );
        expect(transformerState.foundFunctions[0].handlerIndex).toBe(0);
        expect(astToCode(transformerState.foundFunctions[1].eventHandler)).toBe(
            'function () { setCount(count() + 1); }',
        );
        expect(astToCode(transformerState.foundFunctions[1].eventHandlerCallStatement)).toBe(
            'refs.adderButton.onclick(add);',
        );
        expect(transformerState.foundFunctions[1].handlerIndex).toBe(0);
    });

    it('defined as nested object function', async () => {
        const code =
            stripMargin(`import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
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
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);
        expect(transformerState.foundFunctions).toHaveLength(2);
        expect(astToCode(transformerState.foundFunctions[0].eventHandler)).toBe(
            'function () { setCount(count() - 1); }',
        );
        expect(astToCode(transformerState.foundFunctions[0].eventHandlerCallStatement)).toBe(
            'refs.subtracter.onclick(events.subtract);',
        );
        expect(astToCode(transformerState.foundFunctions[1].eventHandler)).toBe(
            'function () { setCount(count() + 1); }',
        );
        expect(astToCode(transformerState.foundFunctions[1].eventHandlerCallStatement)).toBe(
            'refs.adderButton.onclick(events.add);',
        );
    });
});
