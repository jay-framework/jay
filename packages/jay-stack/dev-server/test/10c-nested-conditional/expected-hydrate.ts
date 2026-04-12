import {
    element as e,
    dynamicText as dt,
    ReferencesManager,
    conditional as c,
    dynamicElement as de,
    ConstructContext,
    adoptText,
    adoptElement,
    hydrateConditional,
    hydrateForEach,
    adoptDynamicElement,
    // @ts-ignore
} from '/@fs{{ROOT}}/packages/runtime/runtime/dist/index.js';
export function hydrate(rootElement, options) {
    const [itemsRefManager, [refToggleButton]] = ReferencesManager.for(
        options,
        [],
        ['toggleButton'],
        [],
        [],
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        items: itemsRefManager,
    });
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.title),
                hydrateForEach(
                    (vs) => vs.items,
                    '_id',
                    'S0/0/1',
                    () => [
                        adoptDynamicElement('S0/0/1', {}, [
                            adoptText('S1/0', (vs1) => vs1.name),
                            hydrateConditional(
                                (vs1) => vs1.isActive,
                                () => adoptElement('S1/1', {}, []),
                                () => e('span', { class: 'badge' }, ['Active']),
                            ),
                            hydrateConditional(
                                (vs1) => !vs1.isActive,
                                () => adoptElement('S1/2', {}, []),
                                () => e('span', { class: 'badge-off' }, ['Inactive']),
                            ),
                            adoptElement('S1/3', {}, [], refToggleButton()),
                        ]),
                    ],
                    (vs1) => {
                        return de('div', { class: 'item' }, [
                            e('span', { class: 'name' }, [dt((vs12) => vs12.name)]),
                            c(
                                (vs12) => vs12.isActive,
                                () => e('span', { class: 'badge' }, ['Active']),
                            ),
                            c(
                                (vs12) => !vs12.isActive,
                                () => e('span', { class: 'badge-off' }, ['Inactive']),
                            ),
                            e('button', {}, ['Toggle'], refToggleButton()),
                        ]);
                    },
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
