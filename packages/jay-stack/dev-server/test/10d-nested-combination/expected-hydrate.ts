import {
    element as e,
    dynamicText as dt,
    ReferencesManager,
    slowForEachItem,
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
            adoptElement('S0/0', {}, [
                slowForEachItem(
                    (vs) => vs.categories,
                    0,
                    'c1',
                    () =>
                        adoptDynamicElement('S1/0', {}, [
                            STATIC,
                            STATIC,
                            hydrateConditional(
                                (vs1) => vs1.isActive,
                                () => adoptElement('S1/0/2', {}, []),
                                () => e('span', { class: 'active-badge' }, ['Active']),
                            ),
                            hydrateForEach(
                                (vs1) => vs1.items,
                                '_id',
                                'S1/0/3',
                                () => [adoptText('S2/0', (vs2) => vs2.label)],
                                (vs2) => {
                                    return e('ul', {}, [e('li', {}, [dt((vs22) => vs22.label)])]);
                                },
                            ),
                            adoptElement('S1/0/4', {}, [], refToggleButton()),
                        ]),
                ),
                slowForEachItem(
                    (vs) => vs.categories,
                    1,
                    'c2',
                    () =>
                        adoptDynamicElement('S3/0', {}, [
                            STATIC,
                            hydrateConditional(
                                (vs1) => vs1.isActive,
                                () => adoptElement('S3/0/1', {}, []),
                                () => e('span', { class: 'active-badge' }, ['Active']),
                            ),
                            hydrateForEach(
                                (vs1) => vs1.items,
                                '_id',
                                'S3/0/2',
                                () => [adoptText('S4/0', (vs2) => vs2.label)],
                                (vs2) => {
                                    return e('ul', {}, [e('li', {}, [dt((vs22) => vs22.label)])]);
                                },
                            ),
                            adoptElement('S3/0/3', {}, [], refToggleButton()),
                        ]),
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
