import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    childComp,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
    childCompHydrate,
    hydrateForEach,
    adoptDynamicElement,
} from '@jay-framework/runtime';
import { makeHeadlessInstanceComponent } from '@jay-framework/stack-client-runtime';
import {
    DataListSimpleViewState,
    DataListSimpleRefs,
    ItemOfDataListSimpleViewState,
    // @ts-ignore
} from '../data-list-simple/data-list-simple.jay-contract';
import {
    SimpleActionViewState,
    SimpleActionRefs,
    SimpleActionInteractiveViewState,
    SimpleActionRepeatedRefs,
    // @ts-ignore
} from '../simple-action/simple-action.jay-contract';
// @ts-ignore
import { simpleAction } from '../simple-action/simple-action';

export interface HeadlessInstanceInKeyedForeachViewState {
    data?: DataListSimpleViewState;
    pageTitle: string;
}

export interface HeadlessInstanceInKeyedForeachElementRefs {
    data: DataListSimpleRefs;
}

export type HeadlessInstanceInKeyedForeachSlowViewState = {};
export type HeadlessInstanceInKeyedForeachFastViewState = HeadlessInstanceInKeyedForeachViewState;
export type HeadlessInstanceInKeyedForeachInteractiveViewState =
    HeadlessInstanceInKeyedForeachViewState;

export type HeadlessInstanceInKeyedForeachElement = JayElement<
    HeadlessInstanceInKeyedForeachViewState,
    HeadlessInstanceInKeyedForeachElementRefs
>;
export type HeadlessInstanceInKeyedForeachElementRender = RenderElement<
    HeadlessInstanceInKeyedForeachViewState,
    HeadlessInstanceInKeyedForeachElementRefs,
    HeadlessInstanceInKeyedForeachElement
>;
export type HeadlessInstanceInKeyedForeachElementPreRender = [
    HeadlessInstanceInKeyedForeachElementRefs,
    HeadlessInstanceInKeyedForeachElementRender,
];
export type HeadlessInstanceInKeyedForeachContract = JayContract<
    HeadlessInstanceInKeyedForeachViewState,
    HeadlessInstanceInKeyedForeachElementRefs,
    HeadlessInstanceInKeyedForeachSlowViewState,
    HeadlessInstanceInKeyedForeachFastViewState,
    HeadlessInstanceInKeyedForeachInteractiveViewState
>;

// Hydrate inline template for headless component: simple-action #0
type _HeadlessSimpleAction0Element = JayElement<SimpleActionInteractiveViewState, SimpleActionRefs>;
type _HeadlessSimpleAction0ElementRender = RenderElement<
    SimpleActionInteractiveViewState,
    SimpleActionRefs,
    _HeadlessSimpleAction0Element
>;
type _HeadlessSimpleAction0ElementPreRender = [
    SimpleActionRefs,
    _HeadlessSimpleAction0ElementRender,
];

function _headlessSimpleAction0HydrateRender(
    options?: RenderElementOptions,
): _HeadlessSimpleAction0ElementPreRender {
    const [refManager, [refActionBtn, refDone]] = ReferencesManager.for(
        options,
        ['actionBtn', 'done'],
        [],
        [],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('S2/0', {}, [], refActionBtn()),
        ) as _HeadlessSimpleAction0Element;
    return [refManager.getPublicAPI() as SimpleActionRefs, render];
}
const _HeadlessSimpleAction0Adopt = makeHeadlessInstanceComponent(
    _headlessSimpleAction0HydrateRender,
    simpleAction,
    (dataIds) => [...dataIds, 'simple-action:AR0'].toString(),
);

// Inline template for headless component: simple-action #1
type _HeadlessSimpleAction1Element = JayElement<SimpleActionInteractiveViewState, SimpleActionRefs>;
type _HeadlessSimpleAction1ElementRender = RenderElement<
    SimpleActionInteractiveViewState,
    SimpleActionRefs,
    _HeadlessSimpleAction1Element
>;
type _HeadlessSimpleAction1ElementPreRender = [
    SimpleActionRefs,
    _HeadlessSimpleAction1ElementRender,
];

function _headlessSimpleAction1Render(
    options?: RenderElementOptions,
): _HeadlessSimpleAction1ElementPreRender {
    const [refManager, [refActionBtn, refDone]] = ReferencesManager.for(
        options,
        ['actionBtn', 'done'],
        [],
        [],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('button', {}, ['Click'], refActionBtn()),
        ) as _HeadlessSimpleAction1Element;
    return [refManager.getPublicAPI() as SimpleActionRefs, render];
}

const _HeadlessSimpleAction1 = makeHeadlessInstanceComponent(
    _headlessSimpleAction1Render,
    simpleAction,
    (dataIds) => [...dataIds, 'simple-action:AR0'].toString(),
);

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): HeadlessInstanceInKeyedForeachElementPreRender {
    const [itemsRefManager, [refAr0]] = ReferencesManager.for(options, [], [], [], ['ar0']);
    const [dataRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        items: itemsRefManager,
    });
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        data: dataRefManager,
    });
    const render = (viewState: HeadlessInstanceInKeyedForeachViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('S0/0', {}, [
                hydrateForEach(
                    (vs: HeadlessInstanceInKeyedForeachViewState) => vs.data?.items,
                    'slug',
                    'S0/0/0',
                    () => [
                        // @ts-ignore
                        adoptText('S1/0', (vs1) => vs1.title),
                        childCompHydrate(
                            _HeadlessSimpleAction0Adopt,
                            (vs1: ItemOfDataListSimpleViewState) => ({ text: vs1.title }),
                            'S2/0',
                            refAr0(),
                        ),
                    ],
                    (vs1: ItemOfDataListSimpleViewState) => {
                        return e('div', {}, [
                            e('h2', {}, [dt((vs1) => vs1.title)]),
                            childComp(
                                _HeadlessSimpleAction1,
                                (vs1: ItemOfDataListSimpleViewState) => ({ text: vs1.title }),
                                refAr0(),
                            ),
                        ]);
                    },
                ),
            ]),
        ) as HeadlessInstanceInKeyedForeachElement;
    return [refManager.getPublicAPI() as HeadlessInstanceInKeyedForeachElementRefs, render];
}
