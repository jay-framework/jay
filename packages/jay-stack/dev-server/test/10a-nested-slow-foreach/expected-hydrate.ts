import {
    ReferencesManager,
    slowForEachItem,
    ConstructContext,
    adoptText,
    adoptElement,
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
                            slowForEachItem(
                                (vs1) => vs1.items,
                                0,
                                'i1',
                                () => adoptText('1', (vs2) => vs2.count),
                            ),
                            slowForEachItem(
                                (vs1) => vs1.items,
                                1,
                                'i2',
                                () => adoptText('1', (vs2) => vs2.count),
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
                            slowForEachItem(
                                (vs1) => vs1.items,
                                0,
                                'i3',
                                () => adoptText('1', (vs2) => vs2.count),
                            ),
                            slowForEachItem(
                                (vs1) => vs1.items,
                                1,
                                'i4',
                                () => adoptText('1', (vs2) => vs2.count),
                            ),
                        ]),
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
