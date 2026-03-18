import {
    element as e,
    dynamicText as dt,
    ReferencesManager,
    ConstructContext,
    hydrateForEach,
    adoptDynamicElement,
    STATIC,
// @ts-ignore
} from '/@fs/Users/yoav/work/jay/main/packages/runtime/runtime/dist/index.js';
export function hydrate(rootElement, options) {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('0', {}, [
                STATIC,
                hydrateForEach(
                    (vs) => vs.items,
                    '_id',
                    () => [],
                    (vs1) => {
                        return e('ul', {}, [e('li', {}, [dt(vs => vs.name)])]);
                    },
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
