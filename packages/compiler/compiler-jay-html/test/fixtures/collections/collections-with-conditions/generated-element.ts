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
} from 'jay-runtime';

export interface Thing {
    name: string;
    completed: boolean;
    cost: number;
    id: string;
}

export interface CollectionsWithConditionsViewState {
    title: string;
    things: Array<Thing>;
}

export interface CollectionsWithConditionsElementRefs {}

export type CollectionsWithConditionsElement = JayElement<
    CollectionsWithConditionsViewState,
    CollectionsWithConditionsElementRefs
>;
export type CollectionsWithConditionsElementRender = RenderElement<
    CollectionsWithConditionsViewState,
    CollectionsWithConditionsElementRefs,
    CollectionsWithConditionsElement
>;
export type CollectionsWithConditionsElementPreRender = [
    CollectionsWithConditionsElementRefs,
    CollectionsWithConditionsElementRender,
];

export function render(options?: RenderElementOptions): CollectionsWithConditionsElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: CollectionsWithConditionsViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.title)]),
                de('div', {}, [
                    forEach(
                        (vs: CollectionsWithConditionsViewState) => vs.things,
                        (vs1: Thing) => {
                            return de('div', {}, [
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
                                                'color:blue; width: 100px; display: inline-block;',
                                        },
                                    },
                                    [dt((vs1) => vs1.cost)],
                                ),
                                c(
                                    (vs1) => vs1.completed,
                                    () =>
                                        e(
                                            'span',
                                            {
                                                style: {
                                                    cssText:
                                                        'color:red; width: 100px; display: inline-block;',
                                                },
                                            },
                                            ['Done!'],
                                        ),
                                ),
                            ]);
                        },
                        'id',
                    ),
                ]),
            ]),
        ) as CollectionsWithConditionsElement;
    return [refManager.getPublicAPI() as CollectionsWithConditionsElementRefs, render];
}
