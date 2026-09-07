import {
    element as e,
    dynamicText as dt,
    ReferencesManager,
    conditional as c,
    dynamicElement as de,
    forEach,
    ConstructContext,
    adoptText,
    adoptElement,
    hydrateConditional,
    hydrateForEach,
    adoptDynamicElement,
    STATIC,
    // @ts-ignore
} from '/@fs{{ROOT}}/packages/runtime/runtime/dist/index.js';
export function hydrate(rootElement, options) {
    const [itemsRefManager, []] = ReferencesManager.for(options, [], [], [], []);
    const [categoriesRefManager, [refToggleButton]] = ReferencesManager.for(
        options,
        [],
        ['toggleButton'],
        [],
        [],
        {
            items: itemsRefManager,
        },
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        categories: categoriesRefManager,
    });
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('S0/0', {}, [
                adoptElement('S0/0/0', {}, []),
                hydrateForEach(
                    (vs) => vs.categories,
                    '_id',
                    'S0/0/1',
                    (vs1) => [
                        adoptDynamicElement('S0/0/1', {}, [
                            STATIC,
                            ...(vs1.showDetails ? [adoptElement('S1/1', {}, [])] : []),
                            hydrateConditional(
                                (vs12) => vs12.isActive,
                                () => adoptElement('S1/2', {}, []),
                                () => e('span', { class: 'active-badge' }, ['Active']),
                            ),
                            hydrateForEach(
                                (vs12) => vs12.items,
                                '_id',
                                'S1/3',
                                (vs2) => [adoptText('S2/0', (vs22) => vs22.label)],
                                (vs2) => {
                                    return e('ul', {}, [e('li', {}, [dt((vs22) => vs22.label)])]);
                                },
                            ),
                            adoptElement('S1/4', {}, [], refToggleButton()),
                        ]),
                    ],
                    (vs1) => {
                        return de('div', { class: 'category' }, [
                            e('h2', {}, [dt((vs12) => vs12.name)]),
                            c(
                                (vs12) => vs12.showDetails,
                                () => e('p', { class: 'details' }, ['Details visible']),
                            ),
                            c(
                                (vs12) => vs12.isActive,
                                () => e('span', { class: 'active-badge' }, ['Active']),
                            ),
                            forEach(
                                (vs12) => vs12.items,
                                (vs2) => {
                                    return e('ul', {}, [e('li', {}, [dt((vs22) => vs22.label)])]);
                                },
                                '_id',
                            ),
                            e('button', {}, ['Toggle'], refToggleButton()),
                        ]);
                    },
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
