import {
    ReferencesManager,
    ConstructContext,
    adoptText,
    adoptElement,
    // @ts-ignore
} from '/@fs{{ROOT}}/packages/runtime/runtime/dist/index.js';
export function hydrate(rootElement, options) {
    const [headlessRefManager, [refIncrement]] = ReferencesManager.for(
        options,
        ['increment'],
        [],
        [],
        [],
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        headless: headlessRefManager,
    });
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptText('S0/0/1/1', (vs) => vs.headless?.count),
                adoptElement('S0/0/1/2', {}, [], refIncrement()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
