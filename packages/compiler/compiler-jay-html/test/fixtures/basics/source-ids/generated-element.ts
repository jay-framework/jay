import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    conditional as c,
    dynamicElement as de,
    forEach,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface ItemOfSourceIdsViewState {
    label: string;
    id: string;
}

export interface SourceIdsViewState {
    title: string;
    visible: boolean;
    items: Array<ItemOfSourceIdsViewState>;
}

export interface SourceIdsElementRefs {}

export type SourceIdsSlowViewState = {};
export type SourceIdsFastViewState = {};
export type SourceIdsInteractiveViewState = SourceIdsViewState;

export type SourceIdsElement = JayElement<SourceIdsViewState, SourceIdsElementRefs>;
export type SourceIdsElementRender = RenderElement<
    SourceIdsViewState,
    SourceIdsElementRefs,
    SourceIdsElement
>;
export type SourceIdsElementPreRender = [SourceIdsElementRefs, SourceIdsElementRender];
export type SourceIdsContract = JayContract<
    SourceIdsViewState,
    SourceIdsElementRefs,
    SourceIdsSlowViewState,
    SourceIdsFastViewState,
    SourceIdsInteractiveViewState
>;

export function render(options?: RenderElementOptions): SourceIdsElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: SourceIdsViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', { 'data-jay-sid': '13:1' }, [
                e('h1', { 'data-jay-sid': '14:5' }, [dt((vs) => vs.title)]),
                c(
                    (vs) => vs.visible,
                    () => e('p', { 'data-jay-sid': '15:5' }, ['Visible content']),
                ),
                e('span', { style: { cssText: 'color: red;' }, 'data-jay-sid': '16:5' }, [
                    'Static',
                ]),
                de('ul', { 'data-jay-sid': '17:5' }, [
                    forEach(
                        (vs: SourceIdsViewState) => vs.items,
                        (vs1: ItemOfSourceIdsViewState) => {
                            return e('li', { 'data-jay-sid': '18:9' }, [dt((vs1) => vs1.label)]);
                        },
                        'id',
                    ),
                ]),
            ]),
        ) as SourceIdsElement;
    return [refManager.getPublicAPI() as SourceIdsElementRefs, render];
}
