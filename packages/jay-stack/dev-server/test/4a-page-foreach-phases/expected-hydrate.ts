import {
    element as e,
    dynamicText as dt,
    ReferencesManager,
    ConstructContext,
    adoptText,
    adoptElement,
    hydrateForEach,
    adoptDynamicElement,
    STATIC,
    // @ts-ignore
} from '/@fs{{ROOT}}/packages/runtime/runtime/dist/index.js';
export function hydrate(rootElement, options) {
    const [fastItemsRefManager, []] = ReferencesManager.for(options, [], [], [], []);
    const [fastMixedItemsRefManager, [refIncrement]] = ReferencesManager.for(
        options,
        [],
        ['increment'],
        [],
        [],
    );
    const [interactiveItemsRefManager, [refIncrement2]] = ReferencesManager.for(
        options,
        [],
        ['increment'],
        [],
        [],
    );
    const [refManager, [refAddButton, refRemoveButton]] = ReferencesManager.for(
        options,
        ['addButton', 'removeButton'],
        [],
        [],
        [],
        {
            fastItems: fastItemsRefManager,
            fastMixedItems: fastMixedItemsRefManager,
            interactiveItems: interactiveItemsRefManager,
        },
    );
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptDynamicElement('S0/0/2', {}, [
                    STATIC,
                    hydrateForEach(
                        (vs) => vs.fastItems,
                        '_id',
                        'S0/0/2/1',
                        () => [adoptText('S3/0', (vs1) => vs1.label)],
                        (vs1) => {
                            return e('ul', {}, [e('li', {}, [dt((vs12) => vs12.label)])]);
                        },
                    ),
                ]),
                adoptDynamicElement('S0/0/3', {}, [
                    STATIC,
                    hydrateForEach(
                        (vs) => vs.fastMixedItems,
                        '_id',
                        'S0/0/3/1',
                        () => [
                            adoptText('S4/0', (vs1) => vs1.label),
                            adoptText('S4/1', (vs1) => vs1.count),
                            adoptElement('S4/2', {}, [], refIncrement()),
                        ],
                        (vs1) => {
                            return e('div', { class: 'item' }, [
                                e('span', { class: 'label' }, [dt((vs12) => vs12.label)]),
                                e('span', { class: 'count' }, [dt((vs12) => vs12.count)]),
                                e('button', {}, ['+1'], refIncrement()),
                            ]);
                        },
                    ),
                ]),
                adoptDynamicElement('S0/0/4', {}, [
                    STATIC,
                    hydrateForEach(
                        (vs) => vs.interactiveItems,
                        '_id',
                        'S0/0/4/1',
                        () => [
                            adoptText('S5/0', (vs1) => vs1.label),
                            adoptText('S5/1', (vs1) => vs1.count),
                            adoptElement('S5/2', {}, [], refIncrement2()),
                        ],
                        (vs1) => {
                            return e('div', { class: 'item' }, [
                                e('span', { class: 'label' }, [dt((vs12) => vs12.label)]),
                                e('span', { class: 'count' }, [dt((vs12) => vs12.count)]),
                                e('button', {}, ['+1'], refIncrement2()),
                            ]);
                        },
                    ),
                    adoptElement('S0/0/4/2', {}, [], refAddButton()),
                    adoptElement('S0/0/4/3', {}, [], refRemoveButton()),
                ]),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
