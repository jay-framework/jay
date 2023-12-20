import { transformCode } from '../test-utils/ts-compiler-test-utils';
import { mkTransformer } from '../../lib/ts-file/mk-transformer';
import { stripMargin } from '../test-utils/strip-margin';
import ts, {
    FunctionLikeDeclarationBase,
    isArrowFunction,
    isFunctionDeclaration,
    isFunctionExpression,
    TransformerFactory,
} from 'typescript';
import { findComponentConstructorsBlock } from '../../lib/ts-file/building-blocks/find-component-constructors';
import { findComponentConstructorCallsBlock } from '../../lib/ts-file/building-blocks/find-component-constructor-calls';

describe('find component constructor', () => {
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

                state.foundFunctions = findComponentConstructorsBlock(
                    componentFunctionExpressions,
                    sourceFileTransformerData,
                );
                return sourceFileTransformerData.sourceFile;
            }),
        };
        return state as {
            foundFunctions: FunctionLikeDeclarationBase[];
            transformer: TransformerFactory<ts.SourceFile>;
        };
    }

    it('find private named component constructor', async () => {
        const code =
            stripMargin(`import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
        | }
        |
        | export const Counter = makeJayComponent(render, CounterComponent);`);
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);
        expect(transformerState.foundFunctions).toHaveLength(1);
        expect(isFunctionDeclaration(transformerState.foundFunctions[0])).toBeTruthy();
    });

    it('find private named arrow component constructor', async () => {
        const code =
            stripMargin(`import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | const CounterComponent = ({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) => {
        | }
        |
        | export const Counter = makeJayComponent(render, CounterComponent);`);
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);
        expect(transformerState.foundFunctions).toHaveLength(1);
        expect(isArrowFunction(transformerState.foundFunctions[0])).toBeTruthy();
    });

    it('find inline named component constructor', async () => {
        const code =
            stripMargin(`import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | export const Counter = makeJayComponent(render, 
        |   function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
        |   });`);
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);
        expect(transformerState.foundFunctions).toHaveLength(1);
        expect(isFunctionExpression(transformerState.foundFunctions[0])).toBeTruthy();
    });

    it('find inline component constructor', async () => {
        const code =
            stripMargin(`import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | export const Counter = makeJayComponent(render, 
        |   function ({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
        |   });`);
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);
        expect(transformerState.foundFunctions).toHaveLength(1);
        expect(isFunctionExpression(transformerState.foundFunctions[0])).toBeTruthy();
    });

    it('find inline arrow component constructor', async () => {
        const code =
            stripMargin(`import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | export const Counter = makeJayComponent(render, 
        |   ({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) => {
        |   });`);
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);
        expect(transformerState.foundFunctions).toHaveLength(1);
        expect(isArrowFunction(transformerState.foundFunctions[0])).toBeTruthy();
    });
});
