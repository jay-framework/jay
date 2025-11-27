import {
    JayElement,
    element as e,
    svgElement as svg,
    dynamicAttribute as da,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface SimpleSvgViewState {
    color: string;
}

export interface SimpleSvgElementRefs {}

export type SimpleSvgSlowViewState = {};
export type SimpleSvgFastViewState = {};
export type SimpleSvgInteractiveViewState = SimpleSvgViewState;

export type SimpleSvgElement = JayElement<SimpleSvgViewState, SimpleSvgElementRefs>;
export type SimpleSvgElementRender = RenderElement<
    SimpleSvgViewState,
    SimpleSvgElementRefs,
    SimpleSvgElement
>;
export type SimpleSvgElementPreRender = [SimpleSvgElementRefs, SimpleSvgElementRender];
export type SimpleSvgContract = JayContract<
    SimpleSvgViewState,
    SimpleSvgElementRefs,
    SimpleSvgSlowViewState,
    SimpleSvgFastViewState,
    SimpleSvgInteractiveViewState
>;

export function render(options?: RenderElementOptions): SimpleSvgElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: SimpleSvgViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                svg('svg', { width: '200', height: '200', viewbox: '0 0 200' }, [
                    svg(
                        'circle',
                        { r: '50', cx: '100', cy: '100', fill: da((vs) => vs.color) },
                        [],
                    ),
                ]),
            ]),
        ) as SimpleSvgElement;
    return [refManager.getPublicAPI() as SimpleSvgElementRefs, render];
}
