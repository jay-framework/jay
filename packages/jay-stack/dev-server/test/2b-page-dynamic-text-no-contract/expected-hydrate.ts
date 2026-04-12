import {
    ReferencesManager,
    ConstructContext,
    adoptText,
    adoptElement,
    // @ts-ignore
} from '/@fs{{ROOT}}/packages/runtime/runtime/dist/index.js';
export function hydrate(rootElement, options) {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.title),
                adoptText('S0/0/1', (vs) => `Count: ${vs.count}`),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
