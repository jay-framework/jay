import { mkTransformer } from '../../lib/ts-file/ts-utils/mk-transformer';
import ts from 'typescript';
import { transformCode } from '../test-utils/ts-compiler-test-utils';
import { prettify } from '../../lib';
import { analyzeEventHandlerCallStatement$Block } from '../../lib/ts-file/building-blocks/analyze-event-handler-call$';
import { FoundEventHandler } from '../../lib/ts-file/building-blocks/find-event-handler-functions';

describe('add event handler call$ to call chain', () => {
    function testTransformer() {
        const foundEventHandlerMock: FoundEventHandler = { handlerIndex: 0 } as FoundEventHandler;

        return mkTransformer(({ context, sourceFile, factory }) => {
            return ts.visitEachChild(
                sourceFile,
                analyzeEventHandlerCallStatement$Block(context, factory, '0'),
                context,
            );
        });
    }

    it('should support inline event handler', async () => {
        const eventHandlerCall = `refs.comp.onclick(({event}) => {})`;
        const transformerState = testTransformer();
        let transformed = await transformCode(eventHandlerCall, [transformerState]);

        expect(transformed).toEqual(
            await prettify(`refs.comp.onclick$(handler$('0')).then(({event}) => {})`),
        );
    });

    it('should support regular event handler', async () => {
        const eventHandlerCall = `refs.comp.onclick(someHandlerIdentifier)`;
        const transformerState = testTransformer();
        let transformed = await transformCode(eventHandlerCall, [transformerState]);

        expect(transformed).toEqual(
            await prettify(`refs.comp.onclick$(handler$('0')).then(someHandlerIdentifier)`),
        );
    });
});
