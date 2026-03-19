import {
    ReferencesManager,
    ConstructContext,
    adoptText,
    adoptElement,
    // @ts-ignore
} from '/@fs{{ROOT}}/packages/runtime/runtime/dist/index.js';
export function hydrate(rootElement, options) {
    const [refManager, [refIncrementButton]] = ReferencesManager.for(
        options,
        ['incrementButton'],
        [],
        [],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                adoptText('0/0', (vs) => vs.title),
                adoptText('0/1', (vs) => `Count: ${vs.count}`),
                adoptElement('0/2', {}, [], refIncrementButton()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
