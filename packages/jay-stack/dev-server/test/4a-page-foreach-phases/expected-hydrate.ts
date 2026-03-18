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
    const [interactiveItemsRefManager, []] = ReferencesManager.for(options, [], [], [], []);
    const [refManager, [refAddButton, refRemoveButton]] = ReferencesManager.for(
        options,
        ['addButton', 'removeButton'],
        [],
        [],
        [],
        {
            fastItems: fastItemsRefManager,
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
                        (vs) => vs.interactiveItems,
                        '_id',
                        () => [adoptText('0', (vs1) => vs1.label)],
                        (vs1) => {
                            return e('ul', {}, [e('li', {}, [dt((vs12) => vs12.label)])]);
                        },
                    ),
                    adoptElement('0/3/2', {}, [], refAddButton()),
                    adoptElement('0/3/3', {}, [], refRemoveButton()),
                ]),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
