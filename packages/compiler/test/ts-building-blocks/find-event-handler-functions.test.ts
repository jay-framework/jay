import { mkTransformer } from '../../lib/ts-file/mk-transformer.ts';
import { findComponentConstructorCallsBlock } from '../../lib/ts-file/building-blocks/find-component-constructor-calls.ts';
import { findComponentConstructorsBlock } from '../../lib/ts-file/building-blocks/find-component-constructors.ts';
import ts, {
    FunctionLikeDeclarationBase,
    isArrowFunction, isFunctionDeclaration,
    TransformerFactory,
} from 'typescript';
import { findEventHandlersBlock } from '../../lib/ts-file/building-blocks/find-event-handler-functions.ts';
import { stripMargin } from '../test-utils/strip-margin.ts';
import { transformCode } from '../test-utils/ts-compiler-test-utils.ts';

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
            foundFunctions: FunctionLikeDeclarationBase[];
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
        expect(isArrowFunction(transformerState.foundFunctions[0])).toBeTruthy();
        expect(isArrowFunction(transformerState.foundFunctions[1])).toBeTruthy();
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
        expect(isArrowFunction(transformerState.foundFunctions[0])).toBeTruthy();
        expect(isArrowFunction(transformerState.foundFunctions[1])).toBeTruthy();
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
        expect(isArrowFunction(transformerState.foundFunctions[0])).toBeTruthy();
        expect(isArrowFunction(transformerState.foundFunctions[1])).toBeTruthy();
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
        expect(isFunctionDeclaration(transformerState.foundFunctions[0])).toBeTruthy();
        expect(isFunctionDeclaration(transformerState.foundFunctions[1])).toBeTruthy();
    })

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
        expect(isArrowFunction(transformerState.foundFunctions[0])).toBeTruthy();
        expect(isArrowFunction(transformerState.foundFunctions[1])).toBeTruthy();
    })
});
