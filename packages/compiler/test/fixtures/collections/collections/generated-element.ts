import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    forEach,
    ConstructContext,
    RenderElementOptions,
} from 'jay-runtime';

export interface Thing {
    name: string;
    completed: boolean;
    cost: number;
    id: string;
}

export interface CollectionsViewState {
    title: string;
    things: Array<Thing>;
}

export interface CollectionsElementRefs {}

export type CollectionsElement = JayElement<CollectionsViewState, CollectionsElementRefs>;
export type CollectionsElementRender = RenderElement<
    CollectionsViewState,
    CollectionsElementRefs,
    CollectionsElement
>;
export type CollectionsElementPreRender = [refs: CollectionsElementRefs, CollectionsElementRender];

export function render(options?: RenderElementOptions): CollectionsElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: CollectionsViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.title)]),
                de('div', {}, [
                    forEach(
                        (vs) => vs.things,
                        (vs1: Thing) => {
                            return e('div', {}, [
                                e(
                                    'span',
                                    {
                                        style: {
                                            cssText:
                                                'color:green; width: 100px; display: inline-block;',
                                        },
                                    },
                                    [dt((vs) => vs.name)],
                                ),
                                e(
                                    'span',
                                    {
                                        style: {
                                            cssText:
                                                'color:red; width: 100px; display: inline-block;',
                                        },
                                    },
                                    [dt((vs) => vs.completed)],
                                ),
                                e(
                                    'span',
                                    {
                                        style: {
                                            cssText:
                                                'color:blue; width: 100px; display: inline-block;',
                                        },
                                    },
                                    [dt((vs) => vs.cost)],
                                ),
                            ]);
                        },
                        'id',
                    ),
                ]),
            ]),
        ) as CollectionsElement;
    return [refManager.getPublicAPI() as CollectionsElementRefs, render];
}
