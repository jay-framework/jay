import {
    childComp,
    ConstructContext,
    element as e,
    HTMLElementProxy,
    JayElement,
    JayEventHandlerWrapper,
    ReferencesManager,
    RenderElementOptions,
} from '../../lib';
import { Item, ItemProps } from './comps/item.ts';
import { ItemComponentType } from './comps/item-refs';

describe('ref creation ordering with reference targets', () => {
    describe('for single element', () => {
        const VIEW_STATE = 'DataContext';
        const SOME_VALUE = 'some text in the element';
        const refName1 = 'refName1';
        interface RootElementViewState {}
        interface RootElementRefs {
            refName1: HTMLElementProxy<RootElementViewState, HTMLDivElement>;
        }

        function preRenderJayElement(
            eventWrapper: JayEventHandlerWrapper<any, any, any> = undefined,
        ) {
            let options: RenderElementOptions = { eventWrapper };
            let [refManager, [ref]] = ReferencesManager.for(options, [refName1], [], [], []);
            let refs = refManager.getPublicAPI() as RootElementRefs;
            let renderJayElement = () => {
                return ConstructContext.withRootContext<string, RootElementRefs>(
                    VIEW_STATE,
                    refManager,
                    () => {
                        return e('div', {}, [
                            e('div', { id: 'one' }, [SOME_VALUE], ref()),
                            e('div', {}, [SOME_VALUE]),
                        ]) as JayElement<RootElementViewState, RootElementRefs>;
                    },
                );
            };

            return { refs, renderJayElement };
        }

        it('should support returning refs before creating the element', () => {
            const { refs, renderJayElement } = preRenderJayElement();
            expect(refs[refName1]).toBeDefined();
        });

        it('should support registering events on ref before creating the element', () => {
            const { refs, renderJayElement } = preRenderJayElement();
            const mockCallback = vi.fn(() => undefined);
            refs.refName1.onclick(mockCallback);

            const element = renderJayElement();
            (element.dom.childNodes[0] as HTMLElement).click();

            expect(mockCallback.mock.calls.length).toBe(1);
        });
    });

    describe('for single component', () => {
        interface RootElementViewState {}
        interface RootElementRefs {
            refName1: ItemComponentType<RootElementViewState>;
        }

        function preRenderJayElement(
            eventWrapper: JayEventHandlerWrapper<any, any, any> = undefined,
        ) {
            const refName1 = 'refName1';
            const VIEW_STATE = 'DataContext';
            const ITEM_PROPS = { text: 'hello', dataId: 'A' };
            let jayComponent: ReturnType<typeof Item>;
            let [refManager, [comp]] = ReferencesManager.for(
                { eventWrapper },
                [],
                [],
                [refName1],
                [],
            );
            const renderJayElement = (): JayElement<RootElementViewState, RootElementRefs> =>
                ConstructContext.withRootContext(VIEW_STATE, refManager, () => {
                    return e('div', {}, [
                        childComp(
                            (props) => (jayComponent = Item(props as ItemProps)),
                            (vs) => ITEM_PROPS,
                            comp(),
                        ),
                    ]);
                }) as JayElement<RootElementViewState, RootElementRefs>;
            let mockCallback = vi.fn(() => undefined);
            return {
                renderJayElement,
                mockCallback,
                jayComponent,
                refs: refManager.getPublicAPI() as RootElementRefs,
            };
        }

        it('should support returning refs before creating the element', () => {
            const { refs, renderJayElement } = preRenderJayElement();
            expect(refs.refName1).toBeDefined();
        });

        it('before creating the element, the component should not be available ', () => {
            const { refs, renderJayElement } = preRenderJayElement();
            expect(refs.refName1.getItemSummary).not.toBeDefined();
        });

        it('after creating the element, the component should be available ', () => {
            const { refs, renderJayElement } = preRenderJayElement();

            renderJayElement();
            expect(refs.refName1).toBeDefined();
            expect(refs.refName1.getItemSummary()).toBe('item hello - false');
        });
    });
});
