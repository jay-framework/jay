import { ConstructContext, element as e, ReferencesManager } from '../../lib/';
import { HTMLElementProxy } from '../../lib';
import '../../lib/element-test-types';

const SOME_VALUE = 'some text in the element';
const DATA_CONTEXT = 'DataContext';

describe('ReferencesManager contract ref stubs', () => {
    describe('stub refs for contract-declared refs not in template', () => {
        interface RootElementRefs {
            templateRef: HTMLElementProxy<string, HTMLDivElement>;
            stubRef: HTMLElementProxy<string, HTMLDivElement>;
        }

        function mkElement() {
            let jayElement1;
            let [refManager, [ref, _stubRef]] = ReferencesManager.for(
                {},
                ['templateRef', 'stubRef'],
                [],
                [],
                [],
            );
            let jayRootElement = ConstructContext.withRootContext<string, RootElementRefs>(
                DATA_CONTEXT,
                refManager,
                () => {
                    return e('div', {}, [(jayElement1 = e('div', {}, [SOME_VALUE], ref()))]);
                },
            );
            return { jayRootElement, jayElement1 };
        }

        it('stub ref should exist in the public API', () => {
            let { jayRootElement } = mkElement();
            expect(jayRootElement.refs.stubRef).toBeDefined();
        });

        it('template ref should still work normally', () => {
            let { jayRootElement, jayElement1 } = mkElement();
            let mockCallback = vi.fn(() => undefined);
            jayRootElement.refs.templateRef.exec$(mockCallback);
            expect(mockCallback.mock.calls.length).toBe(1);
            expect(mockCallback).toHaveBeenCalledWith(jayElement1.dom, DATA_CONTEXT);
        });

        it('onclick on stub ref should not throw', () => {
            let { jayRootElement } = mkElement();
            let mockCallback = vi.fn();
            expect(() => jayRootElement.refs.stubRef.onclick(mockCallback)).not.toThrow();
        });

        it('addEventListener on stub ref should not throw', () => {
            let { jayRootElement } = mkElement();
            let mockCallback = vi.fn();
            expect(() =>
                jayRootElement.refs.stubRef.addEventListener('click', mockCallback),
            ).not.toThrow();
        });

        it('exec$ on stub ref should resolve to undefined', async () => {
            let { jayRootElement } = mkElement();
            let result = await jayRootElement.refs.stubRef.exec$((elem) => elem.tagName);
            expect(result).toBeUndefined();
        });
    });
});
