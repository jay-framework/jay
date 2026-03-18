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
} from '/@fs/Users/yoav/work/jay/main/packages/runtime/runtime/dist/index.js';
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
            adoptElement('0', {}, [
                adoptDynamicElement('0/2', {}, [
                    STATIC,
                    hydrateForEach(
                        (vs) => vs.fastItems,
                        '_id',
                        () => [adoptText('0', (vs1) => vs1.label)],
                        (vs1) => {
                            return e('ul', {}, [e('li', {}, [dt((vs12) => vs12.label)])]);
                        },
                    ),
                ]),
                adoptDynamicElement('0/3', {}, [
                    STATIC,
                    hydrateForEach(
                        (vs) => vs.fastMixedItems,
                        '_id',
                        () => [
                            adoptText('0', (vs1) => vs1.label),
                            adoptText('1', (vs1) => vs1.count),
                            adoptElement('2', {}, [], refIncrement()),
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
                adoptDynamicElement('0/4', {}, [
                    STATIC,
                    hydrateForEach(
                        (vs) => vs.interactiveItems,
                        '_id',
                        () => [
                            adoptText('0', (vs1) => vs1.label),
                            adoptText('1', (vs1) => vs1.count),
                            adoptElement('2', {}, [], refIncrement2()),
                        ],
                        (vs1) => {
                            return e('div', { class: 'item' }, [
                                e('span', { class: 'label' }, [dt((vs12) => vs12.label)]),
                                e('span', { class: 'count' }, [dt((vs12) => vs12.count)]),
                                e('button', {}, ['+1'], refIncrement()),
                            ]);
                        },
                    ),
                    adoptElement('0/4/2', {}, [], refAddButton()),
                    adoptElement('0/4/3', {}, [], refRemoveButton()),
                ]),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
