import { mkTransformer } from '../../../lib/components-files/ts-utils/mk-transformer';
import ts from 'typescript';
import { transformCode } from '../../test-utils/ts-compiler-test-utils';
import { analyzeEventHandlerCallStatement$Block } from '../../../lib/components-files/building-blocks/analyze-event-handler-call$';
import { FoundEventHandler } from '../../../lib/components-files/building-blocks/find-event-handler-functions';
import { prettify } from '@jay-framework/compiler-shared';

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
