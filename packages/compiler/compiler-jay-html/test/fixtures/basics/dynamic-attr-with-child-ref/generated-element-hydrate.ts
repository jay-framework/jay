import {
    JayElement,
    dynamicAttribute as da,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
    adoptElement,
} from '@jay-framework/runtime';

export interface DynamicAttrWithChildRefViewState {
    isSelected: boolean;
    label: string;
}

export interface DynamicAttrWithChildRefElementRefs {
    toggle: HTMLElementProxy<DynamicAttrWithChildRefViewState, HTMLInputElement>;
}

export type DynamicAttrWithChildRefSlowViewState = {};
export type DynamicAttrWithChildRefFastViewState = DynamicAttrWithChildRefViewState;
export type DynamicAttrWithChildRefInteractiveViewState = DynamicAttrWithChildRefViewState;

export type DynamicAttrWithChildRefElement = JayElement<
    DynamicAttrWithChildRefViewState,
    DynamicAttrWithChildRefElementRefs
>;
export type DynamicAttrWithChildRefElementRender = RenderElement<
    DynamicAttrWithChildRefViewState,
    DynamicAttrWithChildRefElementRefs,
    DynamicAttrWithChildRefElement
>;
export type DynamicAttrWithChildRefElementPreRender = [
    DynamicAttrWithChildRefElementRefs,
    DynamicAttrWithChildRefElementRender,
];
export type DynamicAttrWithChildRefContract = JayContract<
    DynamicAttrWithChildRefViewState,
    DynamicAttrWithChildRefElementRefs,
    DynamicAttrWithChildRefSlowViewState,
    DynamicAttrWithChildRefFastViewState,
    DynamicAttrWithChildRefInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): DynamicAttrWithChildRefElementPreRender {
    const [refManager, [refToggle]] = ReferencesManager.for(options, ['toggle'], [], [], []);
    const render = (viewState: DynamicAttrWithChildRefViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', { class: da((vs) => `${vs.isSelected ? 'selected' : ''}`) }, [
                adoptElement('0/0', {}, [], refToggle()),
            ]),
        ) as DynamicAttrWithChildRefElement;
    return [refManager.getPublicAPI() as DynamicAttrWithChildRefElementRefs, render];
}
