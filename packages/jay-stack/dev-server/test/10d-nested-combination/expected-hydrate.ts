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
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                slowForEachItem(
                    (vs) => vs.categories,
                    0,
                    'c1',
                    () =>
                        adoptDynamicElement('', {}, [
                            STATIC,
                            STATIC,
                            hydrateConditional(
                                (vs1) => vs1.isActive,
                                () => adoptElement('2', {}, []),
                                () => e('span', { class: 'active-badge' }, ['Active']),
                            ),
                            hydrateForEach(
                                (vs1) => vs1.items,
                                '_id',
                                () => [adoptText('0', (vs2) => vs2.label)],
                                (vs2) => {
                                    return e('ul', {}, [e('li', {}, [dt((vs22) => vs22.label)])]);
                                },
                            ),
                        ]),
                ),
                slowForEachItem(
                    (vs) => vs.categories,
                    1,
                    'c2',
                    () =>
                        adoptDynamicElement('', {}, [
                            STATIC,
                            hydrateConditional(
                                (vs1) => vs1.isActive,
                                () => adoptElement('1', {}, []),
                                () => e('span', { class: 'active-badge' }, ['Active']),
                            ),
                            hydrateForEach(
                                (vs1) => vs1.items,
                                '_id',
                                () => [adoptText('0', (vs2) => vs2.label)],
                                (vs2) => {
                                    return e('ul', {}, [e('li', {}, [dt((vs22) => vs22.label)])]);
                                },
                            ),
                        ]),
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
