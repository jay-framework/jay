import {
    element as e,
    dynamicText as dt,
    ReferencesManager,
    dynamicElement as de,
    forEach,
    ConstructContext,
    adoptText,
    hydrateForEach,
    adoptDynamicElement,
    STATIC,
    // @ts-ignore
} from '/@fs{{ROOT}}/packages/runtime/runtime/dist/index.js';
export function hydrate(rootElement, options) {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('S0/0', {}, [
                STATIC,
                hydrateForEach(
                    (vs) => vs.categories,
                    '_id',
                    'S0/0/1',
                    () => [
                        adoptDynamicElement('S0/0/1', {}, [
                            STATIC,
                            hydrateForEach(
                                (vs1) => vs1.items,
                                '_id',
                                'S1/1',
                                () => [adoptText('S2/1', (vs2) => vs2.count)],
                                (vs2) => {
                                    return e('div', { class: 'item' }, [
                                        e('span', { class: 'label' }, [dt((vs22) => vs22.label)]),
                                        e('span', { class: 'count' }, [dt((vs22) => vs22.count)]),
                                    ]);
                                },
                            ),
                        ]),
                    ],
                    (vs1) => {
                        return de('div', { class: 'category' }, [
                            e('h2', {}, [dt((vs12) => vs12.name)]),
                            forEach(
                                (vs12) => vs12.items,
                                (vs2) => {
                                    return e('div', { class: 'item' }, [
                                        e('span', { class: 'label' }, [dt((vs22) => vs22.label)]),
                                        e('span', { class: 'count' }, [dt((vs22) => vs22.count)]),
                                    ]);
                                },
                                '_id',
                            ),
                        ]);
                    },
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
