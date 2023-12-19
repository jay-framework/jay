import { transformCode } from '../test-utils/ts-compiler-test-utils';
import { mkTransformer } from '../../lib/ts-file/mk-transformer';
import { stripMargin } from '../test-utils/strip-margin';
// import {
//     findComponentConstructorCalls,
//     MakeJayComponentConstructorCalls
// } from "../../lib/ts-file/building-blocks/find-component-constructors.ts";
import ts, {Identifier, isIdentifier, TransformerFactory} from "typescript";

// describe('find component constructor calls', () => {
//     function testTransformer() {
//         let state = {
//             foundCalls: undefined,
//             transformer: mkTransformer((sourceFileTransformerData) => {
//                 state.foundCalls =
//                     findComponentConstructorCalls('makeJayComponent', sourceFileTransformerData);
//                 return sourceFileTransformerData.sourceFile;
//             }),
//         };
//         return state as {foundCalls: MakeJayComponentConstructorCalls[], transformer: TransformerFactory<ts.SourceFile>};
//     }
//
//     it('find import makeJayComponent', async () => {
//         const code = stripMargin(`import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
//         | import { CounterElementRefs, render } from './generated-element';
//         |
//         | function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
//         | }
//         |
//         | export const Counter = makeJayComponent(render, CounterComponent);`);
//         const transformerState = testTransformer();
//         await transformCode(code, [transformerState.transformer]);
//         expect(transformerState.foundCalls).toHaveLength(1)
//
//         expect(isIdentifier(transformerState.foundCalls[0].render)).toBeTruthy();
//         let render = transformerState.foundCalls[0].render as Identifier;
//         expect(render.text).toBe("render");
//
//         expect(isIdentifier(transformerState.foundCalls[0].comp)).toBeTruthy();
//         let comp = transformerState.foundCalls[0].comp as Identifier;
//         expect(comp.text).toBe("CounterComponent");
//     });
//
// });
//
