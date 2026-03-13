import {
    ReferencesManager,
    ConstructContext,
    adoptText,
    adoptElement,
} from '/@fs/Users/yoav/work/jay/main/packages/runtime/runtime/dist/index.js';
export function hydrate(rootElement, options) {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                adoptText('0/0', (vs) => vs.title),
                adoptText('0/1', (vs) => `Count: ${vs.count}`),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
