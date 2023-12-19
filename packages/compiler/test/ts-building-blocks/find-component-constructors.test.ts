import { transformCode } from '../test-utils/ts-compiler-test-utils';
import { mkTransformer } from '../../lib/ts-file/mk-transformer';
import { stripMargin } from '../test-utils/strip-margin';
import ts, {TransformerFactory} from "typescript";
import {findComponentConstructorsBlock} from "../../lib/ts-file/building-blocks/find-component-constructors.ts";
import {
    findComponentConstructorCallsBlock
} from "../../lib/ts-file/building-blocks/find-component-constructor-calls.ts";
import {FunctionDeclaration} from "ts-morph";

describe('find component constructor', () => {
    function testTransformer() {
        let state = {
            foundFunctions: undefined,
            transformer: mkTransformer((sourceFileTransformerData) => {
                let componentConstructorCalls =
                    findComponentConstructorCallsBlock('makeJayComponent', sourceFileTransformerData);
                let componentFunctionExpressions = componentConstructorCalls
                    .map(({comp}) => comp)

                state.foundFunctions =
                    findComponentConstructorsBlock(componentFunctionExpressions, sourceFileTransformerData);
                return sourceFileTransformerData.sourceFile;
            }),
        };
        return state as {foundFunctions: FunctionDeclaration[], transformer: TransformerFactory<ts.SourceFile>};
    }

    it('find private named component constructor', async () => {
        const code = stripMargin(`import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        | import { CounterElementRefs, render } from './generated-element';
        |
        | function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
        | }
        |
        | export const Counter = makeJayComponent(render, CounterComponent);`);
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);
        expect(transformerState.foundFunctions).toHaveLength(1)
    });

});

