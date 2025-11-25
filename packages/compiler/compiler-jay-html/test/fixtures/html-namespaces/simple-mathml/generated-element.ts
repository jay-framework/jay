import {
    JayElement,
    element as e,
    mathMLElement as ml,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface SimpleMathmlViewState {
    color: string;
}

export interface SimpleMathmlElementRefs {}

export type SimpleMathmlSlowViewState = {};
export type SimpleMathmlFastViewState = {};
export type SimpleMathmlInteractiveViewState = SimpleMathmlViewState;


export type SimpleMathmlElement = JayElement<SimpleMathmlViewState, SimpleMathmlElementRefs>;
export type SimpleMathmlElementRender = RenderElement<
    SimpleMathmlViewState,
    SimpleMathmlElementRefs,
    SimpleMathmlElement
>;
export type SimpleMathmlElementPreRender = [SimpleMathmlElementRefs, SimpleMathmlElementRender];
export type SimpleMathmlContract = JayContract<
    SimpleMathmlViewState,
    SimpleMathmlElementRefs,
    SimpleMathmlSlowViewState,
    SimpleMathmlFastViewState,
    SimpleMathmlInteractiveViewState
>;

export function render(options?: RenderElementOptions): SimpleMathmlElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: SimpleMathmlViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                ml('math', { display: 'block' }, [
                    ml('mrow', {}, [
                        ml('msup', {}, [ml('mi', {}, ['x']), ml('mn', {}, ['2'])]),
                        ml('msup', {}, [ml('mi', {}, ['y']), ml('mn', {}, ['2'])]),
                    ]),
                ]),
            ]),
        ) as SimpleMathmlElement;
    return [refManager.getPublicAPI() as SimpleMathmlElementRefs, render];
}
