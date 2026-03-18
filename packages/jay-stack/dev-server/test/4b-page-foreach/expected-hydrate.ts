import {
    element as e,
    dynamicText as dt,
    ReferencesManager,
    ConstructContext,
    adoptText,
    hydrateForEach,
    adoptDynamicElement,
// @ts-ignore
} from '/@fs{{ROOT}}/packages/runtime/runtime/dist/index.js';
export function hydrate(rootElement, options) {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('0', {}, [
                adoptText('0/0', (vs) => vs.title),
                hydrateForEach(
                    (vs) => vs.items,
                    '_id',
                    () => [adoptText('0', (vs1) => vs1.name)],
                    (vs1) => {
                        return e('ul', {}, [e('li', {}, [dt((vs12) => vs12.name)])]);
                    },
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
