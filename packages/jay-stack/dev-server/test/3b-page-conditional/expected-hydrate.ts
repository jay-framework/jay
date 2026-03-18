import {
    element as e,
    ReferencesManager,
    ConstructContext,
    adoptText,
    adoptElement,
    hydrateConditional,
    adoptDynamicElement,
// @ts-ignore
} from '/@fs{{ROOT}}/packages/runtime/runtime/dist/index.js';
export function hydrate(rootElement, options) {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('0', {}, [
                adoptText('0/0', (vs) => vs.message),
                hydrateConditional(
                    (vs) => vs.isActive,
                    () => adoptElement('0/1', {}, []),
                    () => e('span', {}, ['Active']),
                ),
                hydrateConditional(
                    (vs) => !vs.isActive,
                    () => adoptElement('0/2', {}, []),
                    () => e('span', {}, ['Inactive']),
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
