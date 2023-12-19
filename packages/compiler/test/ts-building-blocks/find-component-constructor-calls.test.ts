import { transformCode } from '../test-utils/ts-compiler-test-utils';
import { mkTransformer } from '../../lib/ts-file/mk-transformer';
import { stripMargin } from '../test-utils/strip-margin';
import {
    findComponentConstructorCallsBlock,
    MakeJayComponentConstructorCalls
} from "../../lib/ts-file/building-blocks/find-component-constructor-calls";
import ts, {Expression, Identifier, isIdentifier, TransformerFactory} from "typescript";

describe('find component constructor calls', () => {
    function testTransformer() {
        let state = {
            foundCalls: undefined,
            transformer: mkTransformer((sourceFileTransformerData) => {
                state.foundCalls =
                    findComponentConstructorCallsBlock('makeJayComponent', sourceFileTransformerData);
                return sourceFileTransformerData.sourceFile;
            }),
        };
        return state as {foundCalls: MakeJayComponentConstructorCalls[], transformer: TransformerFactory<ts.SourceFile>};
    }

    function assertIdentifier(expression: Expression, text: string) {
        expect(isIdentifier(expression)).toBeTruthy();
        let render = expression as Identifier;
        expect(render.text).toBe(text);
    }

    it('should find exported const', async () => {
        const code = stripMargin(`export const Counter = makeJayComponent(render, CounterComponent);`);
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);

        expect(transformerState.foundCalls).toHaveLength(1)
        assertIdentifier(transformerState.foundCalls[0].render, 'render')
        assertIdentifier(transformerState.foundCalls[0].comp, 'CounterComponent')
    });

    it('should find exported var', async () => {
        const code = stripMargin(`export var Counter = makeJayComponent(render, CounterComponent);`);
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);

        expect(transformerState.foundCalls).toHaveLength(1)
        assertIdentifier(transformerState.foundCalls[0].render, 'render')
        assertIdentifier(transformerState.foundCalls[0].comp, 'CounterComponent')
    });

    it('should find separate define const and export', async () => {
        const code = stripMargin(`
        | const Counter = makeJayComponent(render, CounterComponent);
        | export Counter`);
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);

        expect(transformerState.foundCalls).toHaveLength(1)
        assertIdentifier(transformerState.foundCalls[0].render, 'render')
        assertIdentifier(transformerState.foundCalls[0].comp, 'CounterComponent')
    });

    it('should find multiple components, with multiple names', async () => {
        const code = stripMargin(`
        | export const Counter = makeJayComponent(render, CounterComponent);
        | export const Counter2 = makeJayComponent(render2, CounterComponent2);
        | export const Counter3 = makeJayComponent(render3, CounterComponent3);`);
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);

        expect(transformerState.foundCalls).toHaveLength(3)
        assertIdentifier(transformerState.foundCalls[0].render, 'render')
        assertIdentifier(transformerState.foundCalls[0].comp, 'CounterComponent')
        assertIdentifier(transformerState.foundCalls[1].render, 'render2')
        assertIdentifier(transformerState.foundCalls[1].comp, 'CounterComponent2')
        assertIdentifier(transformerState.foundCalls[2].render, 'render3')
        assertIdentifier(transformerState.foundCalls[2].comp, 'CounterComponent3')
    });
});

