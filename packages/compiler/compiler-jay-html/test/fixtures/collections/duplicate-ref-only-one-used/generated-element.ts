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
    JayContract,
} from '@jay-framework/runtime';
import {
    DuplicateRefHeadlessViewState,
    DuplicateRefHeadlessRefs,
    CategoryOfFilter2OfDuplicateRefHeadlessViewState,
} from '../../contracts/duplicate-ref-headless/duplicate-ref-headless.jay-contract';

export interface DuplicateRefOnlyOneUsedViewState {
    filters?: DuplicateRefHeadlessViewState;
    title: string;
}

export interface DuplicateRefOnlyOneUsedElementRefs {
    filters: DuplicateRefHeadlessRefs;
}

export type DuplicateRefOnlyOneUsedSlowViewState = {};
export type DuplicateRefOnlyOneUsedFastViewState = {};
export type DuplicateRefOnlyOneUsedInteractiveViewState = DuplicateRefOnlyOneUsedViewState;

export type DuplicateRefOnlyOneUsedElement = JayElement<
    DuplicateRefOnlyOneUsedViewState,
    DuplicateRefOnlyOneUsedElementRefs
>;
export type DuplicateRefOnlyOneUsedElementRender = RenderElement<
    DuplicateRefOnlyOneUsedViewState,
    DuplicateRefOnlyOneUsedElementRefs,
    DuplicateRefOnlyOneUsedElement
>;
export type DuplicateRefOnlyOneUsedElementPreRender = [
    DuplicateRefOnlyOneUsedElementRefs,
    DuplicateRefOnlyOneUsedElementRender,
];
export type DuplicateRefOnlyOneUsedContract = JayContract<
    DuplicateRefOnlyOneUsedViewState,
    DuplicateRefOnlyOneUsedElementRefs,
    DuplicateRefOnlyOneUsedSlowViewState,
    DuplicateRefOnlyOneUsedFastViewState,
    DuplicateRefOnlyOneUsedInteractiveViewState
>;

export function render(options?: RenderElementOptions): DuplicateRefOnlyOneUsedElementPreRender {
    const [rangesRefManager, [refIsSelected2]] = ReferencesManager.for(
        options,
        [],
        ['isSelected'],
        [],
        [],
    );
    const [filter1RefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        ranges: rangesRefManager,
    });
    const [categoriesRefManager, [refIsSelected]] = ReferencesManager.for(
        options,
        [],
        ['isSelected'],
        [],
        [],
    );
    const [filter2RefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        categories: categoriesRefManager,
    });
    const [filtersRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        filter1: filter1RefManager,
        filter2: filter2RefManager,
    });
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        filters: filtersRefManager,
    });
    const render = (viewState: DuplicateRefOnlyOneUsedViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                e('h1', {}, [dt((vs) => vs.title)]),
                forEach(
                    (vs: DuplicateRefOnlyOneUsedViewState) => vs.filters?.filter2?.categories,
                    (vs1: CategoryOfFilter2OfDuplicateRefHeadlessViewState) => {
                        return e('div', {}, [
                            e('span', {}, [dt((vs1) => vs1.name)]),
                            e('input', { type: 'checkbox' }, [], refIsSelected()),
                        ]);
                    },
                    'id',
                ),
            ]),
        ) as DuplicateRefOnlyOneUsedElement;
    return [refManager.getPublicAPI() as DuplicateRefOnlyOneUsedElementRefs, render];
}
