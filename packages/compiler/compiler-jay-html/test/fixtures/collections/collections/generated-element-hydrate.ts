import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
    hydrateForEach,
    adoptDynamicElement,
} from '@jay-framework/runtime';

export interface ThingOfCollectionsViewState {
    name: string;
    completed: boolean;
    cost: number;
    id: string;
}

export interface CollectionsViewState {
    title: string;
    things: Array<ThingOfCollectionsViewState>;
}

export interface CollectionsElementRefs {}

export type CollectionsSlowViewState = {};
export type CollectionsFastViewState = {};
export type CollectionsInteractiveViewState = CollectionsViewState;

export type CollectionsElement = JayElement<CollectionsViewState, CollectionsElementRefs>;
export type CollectionsElementRender = RenderElement<
    CollectionsViewState,
    CollectionsElementRefs,
    CollectionsElement
>;
export type CollectionsElementPreRender = [CollectionsElementRefs, CollectionsElementRender];
export type CollectionsContract = JayContract<
    CollectionsViewState,
    CollectionsElementRefs,
    CollectionsSlowViewState,
    CollectionsFastViewState,
    CollectionsInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): CollectionsElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: CollectionsViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                adoptText('0/0', (vs) => vs.title),
                adoptDynamicElement('0/1', {}, [
                    hydrateForEach(
                        (vs: CollectionsViewState) => vs.things,
                        'id',
                        () => [
                            adoptText('$id/0', (vs1) => vs1.name),
                            adoptText('$id/1', (vs1) => vs1.completed),
                            adoptText('$id/2', (vs1) => vs1.cost),
                        ],
                        (vs1: ThingOfCollectionsViewState) => {
                            return e('div', {}, [
                                e(
                                    'span',
                                    {
                                        style: {
                                            cssText:
                                                'color:green; width: 100px; display: inline-block;',
                                        },
                                    },
                                    [dt((vs1) => vs1.name)],
                                ),
                                e(
                                    'span',
                                    {
                                        style: {
                                            cssText:
                                                'color:red; width: 100px; display: inline-block;',
                                        },
                                    },
                                    [dt((vs1) => vs1.completed)],
                                ),
                                e(
                                    'span',
                                    {
                                        style: {
                                            cssText:
                                                'color:blue; width: 100px; display: inline-block;',
                                        },
                                    },
                                    [dt((vs1) => vs1.cost)],
                                ),
                            ]);
                        },
                    ),
                ]),
            ]),
        ) as CollectionsElement;
    return [refManager.getPublicAPI() as CollectionsElementRefs, render];
}
